from __future__ import annotations

import shlex
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Sequence


class BackendError(RuntimeError):
    pass


class CommandNotFoundError(BackendError):
    pass


class NotARepositoryError(BackendError):
    pass


@dataclass(slots=True)
class CommandResult:
    executable: str
    args: tuple[str, ...]
    cwd: Path
    returncode: int
    stdout: str
    stderr: str

    def command_line(self) -> str:
        return shlex.join((self.executable, *self.args))

    def render(self) -> str:
        parts: list[str] = [f"$ {self.command_line()}"]
        if self.stdout.strip():
            parts.append(self.stdout.rstrip())
        if self.stderr.strip():
            parts.append("[stderr]")
            parts.append(self.stderr.rstrip())
        if self.returncode != 0:
            parts.append(f"[exit code: {self.returncode}]")
        if not self.stdout.strip() and not self.stderr.strip():
            parts.append("[no output]")
        return "\n".join(parts)


class RepoBackend:
    def __init__(self, workspace_root: Path, repo_root: Path | None = None) -> None:
        self.workspace_root = workspace_root.resolve()
        self.repo_root = (repo_root or self.workspace_root).resolve()

    @classmethod
    def discover(cls, start: Path | None = None) -> "RepoBackend":
        workspace_root = (start or Path.cwd()).resolve()
        repo_root = cls._find_git_root(workspace_root)
        return cls(workspace_root=workspace_root, repo_root=repo_root)

    @staticmethod
    def _find_git_root(start: Path) -> Path | None:
        current = start.resolve()
        for candidate in (current, *current.parents):
            if (candidate / ".git").exists():
                return candidate

        git_executable = shutil.which("git")
        if git_executable is None:
            return None

        try:
            completed = subprocess.run(
                [git_executable, "-C", str(start), "rev-parse", "--show-toplevel"],
                check=True,
                capture_output=True,
                text=True,
            )
        except (subprocess.CalledProcessError, FileNotFoundError):
            return None

        root = completed.stdout.strip()
        return Path(root) if root else None

    @property
    def has_git_repo(self) -> bool:
        return self.repo_root is not None

    def _run(self, executable: str, args: Sequence[str], *, cwd: Path | None = None) -> CommandResult:
        resolved = shutil.which(executable)
        if resolved is None:
            raise CommandNotFoundError(f"{executable} is not available on PATH.")

        working_directory = (cwd or self.repo_root or self.workspace_root).resolve()
        completed = subprocess.run(
            [resolved, *args],
            cwd=working_directory,
            capture_output=True,
            text=True,
        )
        return CommandResult(
            executable=executable,
            args=tuple(args),
            cwd=working_directory,
            returncode=completed.returncode,
            stdout=completed.stdout,
            stderr=completed.stderr,
        )

    def _require_repo(self) -> Path:
        if self.repo_root is None:
            raise NotARepositoryError("The current workspace is not inside a Git repository.")
        return self.repo_root

    def run_git(self, args: Sequence[str]) -> CommandResult:
        repo_root = self._require_repo()
        return self._run("git", args, cwd=repo_root)

    def run_gh(self, args: Sequence[str]) -> CommandResult:
        return self._run("gh", args, cwd=self.repo_root or self.workspace_root)

    def git_status(self) -> CommandResult:
        return self.run_git(["status", "--short", "--branch"])

    def git_branches(self) -> CommandResult:
        return self.run_git(["branch", "--all", "--verbose", "--no-color"])

    def git_pull(self) -> CommandResult:
        return self.run_git(["pull", "--ff-only"])

    def git_checkout(self, branch: str) -> CommandResult:
        return self.run_git(["checkout", branch])

    def git_init(self) -> CommandResult:
        return self._run("git", ["init"], cwd=self.workspace_root)

    def gh_pr_list(self, limit: int = 10, head: str | None = None) -> CommandResult:
        args = ["pr", "list", "--state", "open", "--limit", str(limit), "--json", "number,title,url,baseRefName,headRefName"]
        if head:
            args[3:3] = ["--head", head]
        return self.run_gh(args)

    def gh_pr_view(self, reference: str) -> CommandResult:
        return self.run_gh(
            ["pr", "view", reference, "--json", "number,title,url,baseRefName,headRefName,body,state"]
        )

    def gh_pr_checkout(self, reference: str) -> CommandResult:
        return self.run_gh(["pr", "checkout", reference])

    def gh_repo_view(self) -> CommandResult:
        return self.run_gh(["repo", "view", "--json", "nameWithOwner,url,defaultBranchRef"])

    def describe(self) -> str:
        repo_line = f"repo: {self.repo_root}" if self.repo_root else "repo: not found"
        return f"workspace: {self.workspace_root}\n{repo_line}"