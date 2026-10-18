type FormValueReader = Pick<FormData, "get">;

export function readLoginSubmission(submitted: FormValueReader) {
	return {
		serverOrigin: String(submitted.get("serverOrigin") || "").trim(),
		credentials: {
			username: String(submitted.get("username") || "").trim(),
			password: String(submitted.get("password") || ""),
		},
	};
}
