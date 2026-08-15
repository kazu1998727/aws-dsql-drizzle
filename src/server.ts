/**
 * Minimal JSON CRUD API over the schema tables, for the Vite dev UI in web/.
 *
 * Local development only: no authentication, full table access.
 */
import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { eq, getTableColumns, Column } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { createDsqlClient } from "./dsql-client";
import * as schema from "./schema";

/**
 * Tables exposed for CRUD, with their primary key column name and any columns
 * that reference another table (DSQL enforces no FKs, so this is declared here
 * only to let the UI offer a picker instead of a raw UUID field).
 * _SpecialtyToVet is omitted: its composite key needs no generic handling here.
 */
const TABLES: Record<
    string,
    { table: PgTable; pk: string; refs?: Record<string, string> }
> = {
    owner: { table: schema.owner, pk: "id" },
    pet: { table: schema.pet, pk: "id", refs: { ownerId: "owner" } },
    vet: { table: schema.vet, pk: "id" },
    specialty: { table: schema.specialty, pk: "name" },
};

/**
 * Keep only known columns and convert incoming JSON values to what the column
 * expects. Unknown keys are dropped rather than passed through to the query.
 */
function toRow(
    columns: Record<string, Column>,
    body: Record<string, unknown>,
): Record<string, unknown> {
    const row: Record<string, unknown> = {};
    for (const [name, column] of Object.entries(columns)) {
        if (!(name in body)) continue;
        const value = body[name];
        if (value === null || value === "") {
            row[name] = null;
        } else if (column.dataType === "date") {
            const date = new Date(String(value));
            if (Number.isNaN(date.getTime())) {
                throw new HttpError(400, `Invalid date for ${name}: ${value}`);
            }
            row[name] = date;
        } else {
            row[name] = value;
        }
    }
    return row;
}

class HttpError extends Error {
    constructor(
        readonly status: number,
        message: string,
    ) {
        super(message);
    }
}

async function readJsonBody(
    req: IncomingMessage,
): Promise<Record<string, unknown>> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    if (chunks.length === 0) return {};
    try {
        return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
        throw new HttpError(400, "Request body is not valid JSON");
    }
}

const { db, pool } = createDsqlClient();

async function handle(req: IncomingMessage): Promise<unknown> {
    const url = new URL(req.url ?? "/", "http://localhost");
    const [, prefix, tableName, id] = url.pathname.split("/");

    if (prefix !== "api" || !tableName) {
        throw new HttpError(404, `Not found: ${url.pathname}`);
    }
    if (tableName === "tables") {
        return { tables: Object.keys(TABLES) };
    }

    const entry = TABLES[tableName];
    if (!entry) throw new HttpError(404, `Unknown table: ${tableName}`);

    const { table, pk, refs } = entry;
    const columns = getTableColumns(table) as Record<string, Column>;
    const pkColumn = columns[pk]!;
    const byId = () => {
        if (!id) throw new HttpError(400, "Missing id in path");
        return eq(pkColumn, id);
    };

    switch (req.method) {
        case "GET":
            return {
                pk,
                refs: refs ?? {},
                columns: Object.keys(columns),
                rows: await db.select().from(table),
            };

        case "POST": {
            const row = toRow(columns, await readJsonBody(req));
            return (await db.insert(table).values(row).returning())[0];
        }

        case "PUT": {
            const row = toRow(columns, await readJsonBody(req));
            delete row[pk];
            if (Object.keys(row).length === 0) {
                throw new HttpError(400, "No known columns to update");
            }
            const updated = await db
                .update(table)
                .set(row)
                .where(byId())
                .returning();
            if (updated.length === 0)
                throw new HttpError(404, `No row with ${pk}=${id}`);
            return updated[0];
        }

        case "DELETE": {
            const deleted = await db.delete(table).where(byId()).returning();
            if (deleted.length === 0)
                throw new HttpError(404, `No row with ${pk}=${id}`);
            return { deleted: deleted.length };
        }

        default:
            throw new HttpError(405, `Method not allowed: ${req.method}`);
    }
}

/**
 * Drizzle wraps driver errors as "Failed query: ..." and puts the real cause
 * (missing table, auth failure, DNS) in error.cause, so unwrap the chain.
 */
function describe(error: unknown): string {
    const messages: string[] = [];
    for (let e = error; e instanceof Error; e = e.cause) {
        messages.push(e.message);
    }
    return messages.join(" -> ") || String(error);
}

function send(res: ServerResponse, status: number, payload: unknown): void {
    res.writeHead(status, {
        "content-type": "application/json; charset=utf-8",
    });
    res.end(JSON.stringify(payload));
}

const server = createServer((req, res) => {
    handle(req).then(
        (payload) => send(res, 200, payload),
        (error: unknown) => {
            const status = error instanceof HttpError ? error.status : 500;
            if (status === 500) console.error(error);
            send(res, status, { error: describe(error) });
        },
    );
});

const port = Number(process.env["PORT"] ?? 3000);
server.listen(port, () => {
    console.log(`API listening on http://localhost:${port}`);
});

process.on("SIGINT", () => {
    server.close(() => void pool.end().then(() => process.exit(0)));
});
