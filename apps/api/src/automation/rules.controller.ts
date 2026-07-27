import { Body, Controller, Delete, Get, HttpStatus, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { getPrismaClient, newId, type Rule, type RuleExecutionLog } from "@smc/database";
import type { ActionStep, ConditionNode } from "@smc/automation-engine";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtPayload } from "../auth/jwt-payload";
import { httpError } from "../common/http-error";
import { RuleExecutionService } from "./rule-execution.service";
import { validateRuleInput } from "./rule-validation";

interface DryRunDto {
  bodyText?: string;
  senderDisplayName?: string;
  senderIsVip?: boolean;
}

/**
 * The Automation Engine's REST surface (docs/AUTOMATION_ENGINE.md,
 * docs/ROADMAP.md Phase 10) - CRUD over `Rule`, a dry-run test endpoint
 * (Section 14.2's "test before publish" idea scoped to one synthetic
 * sample), and execution-log listing (a basic, list-view realization of
 * Section 14.4's debugger - a full step-by-step trace view is deferred).
 */
@Controller("rules")
@UseGuards(JwtAuthGuard)
export class RulesController {
  constructor(private readonly ruleExecution: RuleExecutionService) {}

  @Get()
  async list(@CurrentUser() claims: JwtPayload): Promise<Rule[]> {
    const prisma = getPrismaClient();
    const rules = await prisma.rule.findMany({
      where: { workspaceId: claims.workspaceId },
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    });
    return rules;
  }

  @Get(":id")
  async get(@Param("id") id: string, @CurrentUser() claims: JwtPayload): Promise<Rule> {
    const prisma = getPrismaClient();
    const rule = await prisma.rule.findFirst({ where: { id, workspaceId: claims.workspaceId } });
    if (!rule) throw httpError(HttpStatus.NOT_FOUND, "RULE_NOT_FOUND", "Rule not found.");
    return rule;
  }

  @Post()
  async create(@Body() body: unknown, @CurrentUser() claims: JwtPayload): Promise<Rule> {
    const input = validateRuleInput(body);
    const prisma = getPrismaClient();
    return prisma.rule.create({
      data: {
        id: newId(),
        workspaceId: claims.workspaceId,
        createdByUserId: claims.sub,
        name: input.name,
        isEnabled: input.isEnabled ?? true,
        priority: input.priority ?? 0,
        triggerType: input.trigger.type,
        trigger: input.trigger,
        conditions: input.conditions,
        actions: input.actions,
      },
    });
  }

  /**
   * Every save increments `version` via an explicit
   * `updateMany({ where: { id, version } })` (docs/DATABASE.md Section 9's
   * documented optimistic-locking pattern) - a 409 means someone else
   * edited this rule first, not a silent overwrite.
   */
  @Patch(":id")
  async update(@Param("id") id: string, @Body() body: unknown, @CurrentUser() claims: JwtPayload): Promise<Rule> {
    const prisma = getPrismaClient();
    const existing = await prisma.rule.findFirst({ where: { id, workspaceId: claims.workspaceId } });
    if (!existing) throw httpError(HttpStatus.NOT_FOUND, "RULE_NOT_FOUND", "Rule not found.");

    const raw = body as Record<string, unknown>;
    // Enable/disable-only edits keep the existing trigger/conditions/actions rather than requiring a full body.
    const input =
      raw.trigger || raw.conditions || raw.actions || raw.name
        ? validateRuleInput({
            name: raw.name ?? existing.name,
            isEnabled: typeof raw.isEnabled === "boolean" ? raw.isEnabled : existing.isEnabled,
            priority: typeof raw.priority === "number" ? raw.priority : existing.priority,
            trigger: raw.trigger ?? existing.trigger,
            conditions: raw.conditions ?? existing.conditions,
            actions: raw.actions ?? existing.actions,
          })
        : {
            name: existing.name,
            isEnabled: typeof raw.isEnabled === "boolean" ? raw.isEnabled : existing.isEnabled,
            priority: existing.priority,
            trigger: existing.trigger as unknown as import("@smc/automation-engine").RuleTrigger,
            conditions: existing.conditions as unknown as ConditionNode,
            actions: existing.actions as unknown as ActionStep[],
          };

    const result = await prisma.rule.updateMany({
      where: { id, workspaceId: claims.workspaceId, version: existing.version },
      data: {
        name: input.name,
        isEnabled: input.isEnabled ?? true,
        priority: input.priority ?? 0,
        triggerType: input.trigger.type,
        trigger: input.trigger,
        conditions: input.conditions,
        actions: input.actions,
        version: { increment: 1 },
      },
    });
    if (result.count === 0) {
      throw httpError(HttpStatus.CONFLICT, "RULE_VERSION_CONFLICT", "This rule was edited elsewhere - reload and try again.");
    }
    return prisma.rule.findUniqueOrThrow({ where: { id } });
  }

  @Delete(":id")
  async remove(@Param("id") id: string, @CurrentUser() claims: JwtPayload) {
    const prisma = getPrismaClient();
    const existing = await prisma.rule.findFirst({ where: { id, workspaceId: claims.workspaceId } });
    if (!existing) throw httpError(HttpStatus.NOT_FOUND, "RULE_NOT_FOUND", "Rule not found.");
    await prisma.rule.update({ where: { id }, data: { deletedAt: new Date() } });
    return { id, deleted: true };
  }

  @Post(":id/dry-run")
  async dryRun(@Param("id") id: string, @Body() dto: DryRunDto, @CurrentUser() claims: JwtPayload) {
    const prisma = getPrismaClient();
    const rule = await prisma.rule.findFirst({ where: { id, workspaceId: claims.workspaceId } });
    if (!rule) throw httpError(HttpStatus.NOT_FOUND, "RULE_NOT_FOUND", "Rule not found.");

    return this.ruleExecution.dryRun(
      { conditions: rule.conditions as unknown as ConditionNode, actions: rule.actions as unknown as ActionStep[] },
      {
        bodyText: dto.bodyText ?? "",
        senderDisplayName: dto.senderDisplayName ?? "Test Sender",
        senderIsVip: dto.senderIsVip ?? false,
      },
    );
  }

  @Get(":id/executions")
  async executions(@Param("id") id: string, @CurrentUser() claims: JwtPayload): Promise<RuleExecutionLog[]> {
    const prisma = getPrismaClient();
    const rule = await prisma.rule.findFirst({ where: { id, workspaceId: claims.workspaceId } });
    if (!rule) throw httpError(HttpStatus.NOT_FOUND, "RULE_NOT_FOUND", "Rule not found.");

    return prisma.ruleExecutionLog.findMany({
      where: { ruleId: id },
      orderBy: { matchedAt: "desc" },
      take: 50,
    });
  }
}
