"""Structured errors shared by wrapper boundaries and native JSON responses."""


class ValiCoreError(RuntimeError):
    def __init__(self, code: str, message: str, field: str | None = None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.field = field

    def as_dict(self) -> dict[str, str]:
        detail = {"code": self.code, "message": self.message}
        if self.field is not None:
            detail["field"] = self.field
        return detail
