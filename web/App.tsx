import { useCallback, useEffect, useState } from "react";

type Row = Record<string, unknown>;
type TableData = {
    pk: string;
    /** column name -> table it references */
    refs: Record<string, string>;
    columns: string[];
    rows: Row[];
};

/** Label a referenced row by its name column, falling back to the key itself. */
function labelOf(target: TableData, row: Row): string {
    return String(row["name"] ?? row[target.pk]);
}

async function api(path: string, method = "GET", body?: Row): Promise<unknown> {
    const res = await fetch(`/api/${path}`, {
        method,
        headers: body ? { "content-type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
    });
    const payload = await res.json();
    if (!res.ok) throw new Error(payload.error ?? res.statusText);
    return payload;
}

/** ISO timestamps are stored as dates; show just the date part so it stays editable. */
function display(value: unknown): string {
    const text = String(value ?? "");
    return /^\d{4}-\d{2}-\d{2}T/.test(text) ? text.slice(0, 10) : text;
}

/**
 * A text field, or a picker when the column references another table and that
 * table's rows have loaded.
 */
function Cell({
    column,
    value,
    target,
    readOnly,
    placeholder,
    onChange,
}: {
    column: string;
    value: unknown;
    target: TableData | undefined;
    readOnly?: boolean;
    placeholder?: string;
    onChange: (value: string) => void;
}) {
    if (target && !readOnly) {
        return (
            <select
                value={String(value ?? "")}
                onChange={(e) => onChange(e.target.value)}
            >
                <option value="">(なし)</option>
                {target.rows.map((row) => (
                    <option
                        key={String(row[target.pk])}
                        value={String(row[target.pk])}
                    >
                        {labelOf(target, row)}
                    </option>
                ))}
            </select>
        );
    }
    return (
        <input
            value={display(value)}
            readOnly={readOnly ?? false}
            placeholder={placeholder ?? column}
            onChange={(e) => onChange(e.target.value)}
        />
    );
}

export function App() {
    const [tables, setTables] = useState<string[]>([]);
    const [selected, setSelected] = useState<string>();
    const [data, setData] = useState<TableData>();
    const [draft, setDraft] = useState<Row>({});
    const [error, setError] = useState<string>();
    const [busy, setBusy] = useState(false);
    /** Rows of each referenced table, keyed by the referencing column. */
    const [refRows, setRefRows] = useState<Record<string, TableData>>({});

    /** Wrap every request so failures land in the error banner instead of the console. */
    const run = useCallback(async (action: () => Promise<void>) => {
        setBusy(true);
        setError(undefined);
        try {
            await action();
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    }, []);

    const reload = useCallback(
        (table: string) =>
            run(async () => {
                setData((await api(table)) as TableData);
            }),
        [run],
    );

    useEffect(() => {
        void run(async () => {
            const { tables } = (await api("tables")) as { tables: string[] };
            setTables(tables);
            setSelected(tables[0]);
        });
    }, [run]);

    useEffect(() => {
        if (selected) {
            setData(undefined);
            setDraft({});
            setRefRows({});
            void reload(selected);
        }
    }, [selected, reload]);

    // Load the referenced tables so FK columns can be picked by name.
    useEffect(() => {
        const refs = Object.entries(data?.refs ?? {});
        if (refs.length === 0) return;
        void run(async () => {
            const loaded = await Promise.all(
                refs.map(
                    async ([column, table]) =>
                        [column, (await api(table)) as TableData] as const,
                ),
            );
            setRefRows(Object.fromEntries(loaded));
        });
    }, [data, run]);

    const editable = (column: string) => column !== data?.pk;

    // specialty has only its primary key, so there is nothing to update there.
    const updatable = data?.columns.some(editable) ?? false;

    const setCell = (index: number, column: string, value: string) =>
        setData((prev) =>
            prev
                ? {
                      ...prev,
                      rows: prev.rows.map((row, i) =>
                          i === index ? { ...row, [column]: value } : row,
                      ),
                  }
                : prev,
        );

    const save = (row: Row) =>
        run(async () => {
            await api(`${selected}/${row[data!.pk]}`, "PUT", row);
            await reload(selected!);
        });

    const remove = (row: Row) =>
        run(async () => {
            await api(`${selected}/${row[data!.pk]}`, "DELETE");
            await reload(selected!);
        });

    const create = () =>
        run(async () => {
            await api(selected!, "POST", draft);
            setDraft({});
            await reload(selected!);
        });

    return (
        <main>
            <h1>Aurora DSQL Admin</h1>

            <nav>
                {tables.map((table) => (
                    <button
                        key={table}
                        onClick={() => setSelected(table)}
                        className={table === selected ? "active" : ""}
                    >
                        {table}
                    </button>
                ))}
            </nav>

            {error && <p className="error">{error}</p>}
            {busy && <p>Loading...</p>}

            {data && (
                <table>
                    <thead>
                        <tr>
                            {data.columns.map((column) => (
                                <th key={column}>{column}</th>
                            ))}
                            <th />
                        </tr>
                    </thead>
                    <tbody>
                        {data.rows.map((row, index) => (
                            <tr key={String(row[data.pk])}>
                                {data.columns.map((column) => (
                                    <td key={column}>
                                        <Cell
                                            column={column}
                                            value={row[column]}
                                            target={refRows[column]}
                                            readOnly={!editable(column)}
                                            onChange={(value) =>
                                                setCell(index, column, value)
                                            }
                                        />
                                    </td>
                                ))}
                                <td className="actions">
                                    {updatable && (
                                        <button
                                            disabled={busy}
                                            onClick={() => void save(row)}
                                        >
                                            保存
                                        </button>
                                    )}
                                    <button
                                        disabled={busy}
                                        onClick={() => void remove(row)}
                                    >
                                        削除
                                    </button>
                                </td>
                            </tr>
                        ))}
                        <tr className="draft">
                            {data.columns.map((column) => (
                                <td key={column}>
                                    <Cell
                                        column={column}
                                        value={draft[column]}
                                        target={refRows[column]}
                                        placeholder={
                                            column === data.pk
                                                ? "(自動採番)"
                                                : column
                                        }
                                        onChange={(value) =>
                                            setDraft({
                                                ...draft,
                                                [column]: value,
                                            })
                                        }
                                    />
                                </td>
                            ))}
                            <td className="actions">
                                <button
                                    disabled={busy}
                                    onClick={() => void create()}
                                >
                                    追加
                                </button>
                            </td>
                        </tr>
                    </tbody>
                </table>
            )}
        </main>
    );
}
