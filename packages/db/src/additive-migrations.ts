const PROHIBITED = [
	["DROP", /\bDROP\b/i],
	["TRUNCATE", /\bTRUNCATE\b/i],
	["DELETE FROM", /\bDELETE\s+FROM\b/i],
	["RENAME", /\bRENAME\b/i],
	["ALTER COLUMN TYPE", /\bALTER\s+COLUMN\b[\s\S]{0,500}\bTYPE\b/i],
	["CREATE OR REPLACE", /\bCREATE\s+OR\s+REPLACE\b/i],
] as const;

function executableSql(sql: string): string {
	return sql
		.replace(/\/\*[\s\S]*?\*\//g, " ")
		.replace(/--[^\r\n]*/g, " ")
		.replace(/'(?:''|[^'])*'/g, "''");
}

export function prohibitedMigrationOperations(sql: string): string[] {
	const executable = executableSql(sql);
	return PROHIBITED.filter(([, pattern]) => pattern.test(executable)).map(
		([label]) => label,
	);
}
