import { Body, Controller, Delete, Get, HttpStatus, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { getPrismaClient, newId, type Rule, type RuleExecutionLog } from "@smc/database";
import type { ActionStep, ConditionNode } from "@smc/automation-engine";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtPayload } from "../auth/jwt-payload";
import { httpError } from "../common/http-error";
import {
  buildPage,
  decodeCursor,
  keysetOr,
  parseLimit,
  parseOrder,
  parseSortBy,
  type CursorPage,
  type SortDirection,
} from "../common/cursor-pagination";
import { RuleExecutionService } from "./rule-execution.service";
import { validateRuleInput } from "./rule-validation";

interface DryRunDto {
  bodyText?: string;
  senderDisplayName?: string;
  senderIsVip?: boolean;
}

/**
 * docs/ROADMAP.md Phase 20.3 - GET /v1/rules' `?sortBy=` allowlist.
 * Deliberately excludes `priority`, which drives the *default* (no
 * `sortBy`) ordering instead - see `RuleListCursor` below.
 */
const RULE_SORT_FIELDS = ["createdAt", "updatedAt", "name"] as const;
type RuleSortField = (typeof RULE_SORT_FIELDS)[number];
const RULE_DEFAULT_ORDER: Record<RuleSortField, SortDirection> = { createdAt: "desc", updatedAt: "desc", name: "asc" };

/**
 * Two shapes in one cursor type: no `sortBy` means "the default compound
 * order" (priority desc, then createdAt desc, then id desc - unchanged
 * from Phase 20.2, kept for backward compatibility with any client already
 * paginating without `?sortBy=`); a `sortBy` present means a single-field
 * keyset walk on that field instead, dropping the priority tiebreak - an
 * explicit sort intent overrides the default ranking, it doesn't layer on
 * top of it.
 */
interface RuleListCursor {
  sortBy?: RuleSortField;
  order?: SortDirection;
  priority?: number;
  createdAt?: string;
  value?: string;
  id: string;
}

interface RuleExecutionCursor {
  matchedAt: string;
  id: string;
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
  async list(
    @CurrentUser() claims: JwtPayload,
    @Query("limit") limitParam?: string,
    @Query("cursor") cursorParam?: string,
    @Query("sortBy") sortByParam?: string,
    @Query("order") orderParam?: string,
  ): Promise<CursorPage<Rule>> {
    const prisma = getPrismaClient();
    const limit = parseLimit(limitParam);
    const cursor = decodeCursor<RuleListCursor>(cursorParam);

    // The cursor is the source of truth once present. No cursor yet: an
    // explicit `?sortBy=` switches into single-field mode; otherwise stay
    // on the default compound (priority, createdAt) order.
    const sortBy = cursor ? cursor.sortBy : sortByParam ? parseSortBy(sortByParam, RULE_SORT_FIELDS, "createdAt") : undefined;
    const order = sortBy ? (cursor?.order ?? parseOrder(orderParam, RULE_DEFAULT_ORDER[sortBy])) : undefined;

    const rules = await prisma.rule.findMany({
      where: {
        workspaceId: claims.workspaceId,
        ...(cursor
          ? sortBy && order
            ? keysetOr(sortBy, order, sortBy === "name" ? cursor.value : new Date(cursor.value!), cursor.id)
            : {
                OR: [
                  { priority: { lt: cursor.priority } },
                  { priority: cursor.priority, createdAt: { lt: new Date(cursor.createdAt!) } },
                  { priority: cursor.priority, createdAt: new Date(cursor.createdAt!), id: { lt: cursor.id } },
                ],
              }
          : {}),
      },
      orderBy: sortBy && order ? [{ [sortBy]: order }, { id: order }] : [{ priority: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });

    return buildPage(rules, limit, (last) =>
      sortBy && order
        ? { sortBy, order, value: sortBy === "name" ? last.name : last[sortBy].toISOString(), id: last.id }
        : { priority: last.priority, createdAt: last.createdAt.toISOString(), id: last.id },
    );
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
  async executions(
    @Param("id") id: string,
    @CurrentUser() claims: JwtPayload,
    @Query("limit") limitParam?: string,
    @Query("cursor") cursorParam?: string,
  ): Promise<CursorPage<RuleExecutionLog>> {
    const prisma = getPrismaClient();
    const rule = await prisma.rule.findFirst({ where: { id, workspaceId: claims.workspaceId } });
    if (!rule) throw httpError(HttpStatus.NOT_FOUND, "RULE_NOT_FOUND", "Rule not found.");

    const limit = parseLimit(limitParam);
    const cursor = decodeCursor<RuleExecutionCursor>(cursorParam);

    const executions = await prisma.ruleExecutionLog.findMany({
      where: {
        ruleId: id,
        ...(cursor
          ? { OR: [{ matchedAt: { lt: new Date(cursor.matchedAt) } }, { matchedAt: new Date(cursor.matchedAt), id: { lt: cursor.id } }] }
          : {}),
      },
      orderBy: [{ matchedAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });

    return buildPage(executions, limit, (last) => ({ matchedAt: last.matchedAt.toISOString(), id: last.id }));
  }
}
