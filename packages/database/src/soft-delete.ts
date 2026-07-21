import type { PrismaClient } from "@prisma/client";

/**
 * Models that carry a `deletedAt` column, matching exactly which models
 * docs/DATABASE.md Section 6 actually specifies soft deletes for (not
 * every model - append-only/admin-catalog tables like Provider,
 * ContactIdentity, and Notification are intentionally excluded, per
 * DATABASE.md Section 7's own exceptions list).
 */
const SOFT_DELETE_MODELS = new Set([
  "Organization",
  "Workspace",
  "Contact",
  "Conversation",
  "Message",
  "User",
  "WorkspaceMember",
  "LinkedAccount",
]);

function uncapitalize(model: string): string {
  return model.charAt(0).toLowerCase() + model.slice(1);
}

/**
 * Enforces docs/DATABASE.md Section 7's soft-delete discipline at the
 * Prisma Client layer, per Section 20's requirement that this be a global
 * Client extension, not a per-query convention engineers have to remember:
 *
 * - findMany/findFirst/count on a soft-deletable model exclude deleted
 *   rows by default (a caller can still pass `deletedAt: { not: null }`
 *   explicitly to see deleted rows, e.g. for an admin "show deleted" view -
 *   the injected `deletedAt: null` only applies as a default, and is
 *   overridden if the caller's own `where` already specifies `deletedAt`).
 * - delete/deleteMany are redirected to an update setting `deletedAt`,
 *   never a real row deletion, for every soft-deletable model.
 *
 * `findUnique` is deliberately NOT intercepted here - an internal,
 * by-id lookup (e.g. resolving a foreign key) is expected to still find
 * soft-deleted rows; UI-facing/repository-level code is responsible for
 * checking `deletedAt` explicitly wherever a soft-deleted record must be
 * treated as "not found." Revisit this narrowing if it proves wrong in
 * practice.
 */
export function withSoftDeletes<T extends PrismaClient>(client: T) {
  return client.$extends({
    name: "soft-delete",
    query: {
      $allModels: {
        async findMany({ model, args, query }) {
          if (SOFT_DELETE_MODELS.has(model)) {
            args.where = { deletedAt: null, ...args.where };
          }
          return query(args);
        },
        async findFirst({ model, args, query }) {
          if (SOFT_DELETE_MODELS.has(model)) {
            args.where = { deletedAt: null, ...args.where };
          }
          return query(args);
        },
        async count({ model, args, query }) {
          if (SOFT_DELETE_MODELS.has(model)) {
            args.where = { deletedAt: null, ...args.where };
          }
          return query(args);
        },
        async delete({ model, args, query }) {
          if (SOFT_DELETE_MODELS.has(model)) {
            const modelClient = (client as unknown as Record<string, any>)[uncapitalize(model)];
            return modelClient.update({
              where: args.where,
              data: { deletedAt: new Date() },
            });
          }
          return query(args);
        },
        async deleteMany({ model, args, query }) {
          if (SOFT_DELETE_MODELS.has(model)) {
            const modelClient = (client as unknown as Record<string, any>)[uncapitalize(model)];
            return modelClient.updateMany({
              where: args.where,
              data: { deletedAt: new Date() },
            });
          }
          return query(args);
        },
      },
    },
  });
}
