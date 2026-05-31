import ast
import json
import os
import re
import tokenize
from dataclasses import dataclass, field
from enum import Enum
from io import StringIO
from typing import Any, Callable


class Severity(Enum):
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    FATAL = "fatal"


@dataclass
class SyntaxIssue:
    code: str
    message: str
    severity: Severity
    line: int = 0
    column: int = 0
    file: str = ""
    suggestion: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "code": self.code,
            "message": self.message,
            "severity": self.severity.value,
            "line": self.line,
            "column": self.column,
            "file": self.file,
            "suggestion": self.suggestion,
        }


@dataclass
class SyntaxCheckResult:
    file_path: str = ""
    is_valid: bool = True
    issues: list[SyntaxIssue] = field(default_factory=list)
    syntax_tree: Any = None
    metrics: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "file_path": self.file_path,
            "is_valid": self.is_valid,
            "issues": [i.to_dict() for i in self.issues],
            "metrics": self.metrics,
        }


class SyntaxRule:
    def __init__(self, code: str, severity: Severity, message: str) -> None:
        self.code = code
        self.severity = severity
        self.message = message

    def check(self, node: ast.AST, context: dict) -> list[SyntaxIssue]:
        raise NotImplementedError


class UnusedImportRule(SyntaxRule):
    def __init__(self) -> None:
        super().__init__("UNUSED_IMPORT", Severity.WARNING, "未使用的导入")

    def check(self, node: ast.AST, context: dict) -> list[SyntaxIssue]:
        issues: list[SyntaxIssue] = []
        if isinstance(node, ast.Import):
            for alias in node.names:
                name = alias.asname or alias.name
                if name not in context.get("used_names", set()):
                    issues.append(SyntaxIssue(
                        code=self.code,
                        message=f"导入 '{name}' 未使用",
                        severity=self.severity,
                        line=node.lineno,
                        column=node.col_offset,
                        suggestion=f"考虑删除 'import {name}'",
                    ))
        return issues


class LongLineRule(SyntaxRule):
    def __init__(self, max_length: int = 100) -> None:
        super().__init__("LONG_LINE", Severity.WARNING, "行过长")
        self.max_length = max_length

    def check_lines(self, lines: list[str]) -> list[SyntaxIssue]:
        issues: list[SyntaxIssue] = []
        for i, line in enumerate(lines, 1):
            if len(line) > self.max_length:
                issues.append(SyntaxIssue(
                    code=self.code,
                    message=f"行长度 {len(line)} 超过 {self.max_length}",
                    severity=self.severity,
                    line=i,
                    column=self.max_length,
                    suggestion="考虑折行以提高可读性",
                ))
        return issues


class NamingConventionRule(SyntaxRule):
    def __init__(self) -> None:
        super().__init__("NAMING_CONVENTION", Severity.INFO, "命名规范")

    def check(self, node: ast.AST, context: dict) -> list[SyntaxIssue]:
        issues: list[SyntaxIssue] = []
        if isinstance(node, ast.FunctionDef):
            if not re.match(r"^[a-z_][a-z0-9_]*$", node.name):
                issues.append(SyntaxIssue(
                    code="FUNCTION_NAMING",
                    message=f"函数名 '{node.name}' 建议使用 snake_case",
                    severity=Severity.WARNING,
                    line=node.lineno,
                    column=node.col_offset,
                ))
        elif isinstance(node, ast.ClassDef):
            if not re.match(r"^[A-Z][a-zA-Z0-9]*$", node.name):
                issues.append(SyntaxIssue(
                    code="CLASS_NAMING",
                    message=f"类名 '{node.name}' 建议使用 PascalCase",
                    severity=Severity.WARNING,
                    line=node.lineno,
                    column=node.col_offset,
                ))
        return issues


class ComplexityRule(SyntaxRule):
    def __init__(self, max_complexity: int = 10) -> None:
        super().__init__("TOO_COMPLEX", Severity.WARNING, "圈复杂度过高")
        self.max_complexity = max_complexity

    def calculate_complexity(self, node: ast.AST) -> int:
        complexity = 1
        for child in ast.walk(node):
            if isinstance(child, (ast.If, ast.For, ast.While, ast.And, ast.Or)):
                complexity += 1
            elif isinstance(child, ast.Try):
                complexity += len(child.handlers)
        return complexity

    def check(self, node: ast.AST, context: dict) -> list[SyntaxIssue]:
        issues: list[SyntaxIssue] = []
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            complexity = self.calculate_complexity(node)
            if complexity > self.max_complexity:
                issues.append(SyntaxIssue(
                    code=self.code,
                    message=f"函数 '{node.name}' 圈复杂度 {complexity} 超过 {self.max_complexity}",
                    severity=self.severity,
                    line=node.lineno,
                    column=node.col_offset,
                    suggestion="考虑拆分为多个函数",
                ))
        return issues


class SyntaxChecker:
    def __init__(self) -> None:
        self._rules: list[SyntaxRule] = [
            NamingConventionRule(),
            ComplexityRule(),
        ]
        self._line_rules = [
            LongLineRule(),
        ]

    def add_rule(self, rule: SyntaxRule) -> None:
        self._rules.append(rule)

    def check_file(self, file_path: str) -> SyntaxCheckResult:
        result = SyntaxCheckResult(file_path=file_path)

        if not os.path.exists(file_path):
            result.is_valid = False
            result.issues.append(SyntaxIssue(
                code="FILE_NOT_FOUND",
                message=f"文件不存在: {file_path}",
                severity=Severity.FATAL,
            ))
            return result

        try:
            with open(file_path, "r", encoding="utf-8") as f:
                source = f.read()
        except Exception as e:
            result.is_valid = False
            result.issues.append(SyntaxIssue(
                code="FILE_READ_ERROR",
                message=f"无法读取文件: {e}",
                severity=Severity.FATAL,
            ))
            return result

        return self.check_source(source, file_path)

    def check_source(self, source: str, file_path: str = "") -> SyntaxCheckResult:
        result = SyntaxCheckResult(file_path=file_path)
        lines = source.splitlines()

        try:
            tree = ast.parse(source)
            result.syntax_tree = tree
        except SyntaxError as e:
            result.is_valid = False
            result.issues.append(SyntaxIssue(
                code="SYNTAX_ERROR",
                message=str(e),
                severity=Severity.ERROR,
                line=e.lineno or 0,
                column=e.offset or 0,
                file=file_path,
            ))
            return result

        context = self._analyze_context(tree)

        for rule in self._line_rules:
            if hasattr(rule, "check_lines"):
                result.issues.extend(rule.check_lines(lines))

        for node in ast.walk(tree):
            for rule in self._rules:
                try:
                    result.issues.extend(rule.check(node, context))
                except Exception:
                    pass

        result.metrics = self._calculate_metrics(tree, source)
        result.issues = sorted(result.issues, key=lambda i: (i.severity.value, i.line))

        return result

    def _analyze_context(self, tree: ast.AST) -> dict:
        used_names: set[str] = set()
        for node in ast.walk(tree):
            if isinstance(node, ast.Name):
                used_names.add(node.id)
        return {"used_names": used_names}

    def _calculate_metrics(self, tree: ast.AST, source: str) -> dict[str, Any]:
        lines = source.splitlines()
        loc = len(lines)
        blank_lines = sum(1 for line in lines if not line.strip())
        comment_lines = sum(1 for line in lines if line.strip().startswith("#"))
        code_lines = loc - blank_lines - comment_lines

        functions = [
            node for node in ast.walk(tree)
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
        ]
        classes = [
            node for node in ast.walk(tree)
            if isinstance(node, ast.ClassDef)
        ]

        return {
            "lines_of_code": loc,
            "code_lines": code_lines,
            "blank_lines": blank_lines,
            "comment_lines": comment_lines,
            "num_functions": len(functions),
            "num_classes": len(classes),
            "comment_density": round(comment_lines / max(loc, 1) * 100, 1),
        }

    def check_directory(
        self,
        directory: str,
        pattern: str = "*.py",
        progress_callback: Callable[[int, int], None] | None = None,
    ) -> list[SyntaxCheckResult]:
        results: list[SyntaxCheckResult] = []
        import fnmatch

        files_to_check: list[str] = []
        for root, _, files in os.walk(directory):
            for fname in files:
                if fnmatch.fnmatch(fname, pattern):
                    files_to_check.append(os.path.join(root, fname))

        total = len(files_to_check)
        for i, file_path in enumerate(files_to_check):
            results.append(self.check_file(file_path))
            if progress_callback:
                progress_callback(i + 1, total)

        return results


class MultiLanguageChecker:
    def __init__(self) -> None:
        self._python_checker = SyntaxChecker()

    def check(self, file_path: str) -> SyntaxCheckResult:
        if file_path.endswith(".py"):
            return self._python_checker.check_file(file_path)
        else:
            return self._check_generic(file_path)

    def _check_generic(self, file_path: str) -> SyntaxCheckResult:
        result = SyntaxCheckResult(file_path=file_path)
        result.metrics = {"note": "仅支持 Python 语法检测"}
        return result
