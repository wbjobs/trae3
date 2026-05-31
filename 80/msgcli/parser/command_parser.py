import json
import hashlib
from typing import List, Dict, Any, Optional, Callable
from dataclasses import dataclass, field
from datetime import datetime

from ..common import get_logger
from .lexer import Lexer, Token, TokenType


@dataclass
class ParsedCommand:
    command: str
    subcommand: Optional[str] = None
    args: List[Any] = field(default_factory=list)
    flags: List[str] = field(default_factory=list)
    options: Dict[str, Any] = field(default_factory=dict)
    pipeline: List['ParsedCommand'] = field(default_factory=list)
    condition: Optional[str] = None
    background: bool = False
    raw_input: str = ""
    command_id: str = ""
    line_number: int = 1

    def __repr__(self):
        parts = [f"cmd={self.command}"]
        if self.subcommand:
            parts.append(f"sub={self.subcommand}")
        if self.args:
            parts.append(f"args={self.args}")
        if self.flags:
            parts.append(f"flags={self.flags}")
        if self.options:
            parts.append(f"opts={self.options}")
        if self.pipeline:
            parts.append(f"pipe={len(self.pipeline)}")
        if self.condition:
            parts.append(f"cond={self.condition}")
        return f"ParsedCommand({', '.join(parts)})"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "command_id": self.command_id,
            "command": self.command,
            "subcommand": self.subcommand,
            "args": self.args,
            "flags": self.flags,
            "options": self.options,
            "pipeline": [p.to_dict() for p in self.pipeline],
            "condition": self.condition,
            "background": self.background,
            "raw_input": self.raw_input,
            "line_number": self.line_number,
        }


@dataclass
class BatchResult:
    batch_id: str
    total_commands: int
    executed_commands: int
    failed_commands: int
    results: List[Dict[str, Any]] = field(default_factory=list)
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "batch_id": self.batch_id,
            "total_commands": self.total_commands,
            "executed_commands": self.executed_commands,
            "failed_commands": self.failed_commands,
            "results": self.results,
            "start_time": self.start_time.isoformat() if self.start_time else None,
            "end_time": self.end_time.isoformat() if self.end_time else None,
        }


class CommandParser:
    def __init__(self):
        self.logger = get_logger("CommandParser")
        self.tokens: List[Token] = []
        self.pos: int = 0
        self.variables: Dict[str, Any] = {}

    def parse(self, command_line: str) -> List[ParsedCommand]:
        lexer = Lexer(command_line)
        self.tokens = lexer.tokenize()
        self.pos = 0

        commands: List[ParsedCommand] = []
        current_line = 1
        
        while not self._is_at_end():
            cmd = self._parse_command()
            cmd.raw_input = command_line
            cmd.line_number = current_line
            cmd.command_id = self._generate_command_id(cmd)
            
            if cmd.command:
                commands.append(cmd)
            
            if self._check(TokenType.SEMICOLON) or self._check(TokenType.AND) or self._check(TokenType.OR):
                if self._check(TokenType.AND):
                    cmd.condition = "&&"
                elif self._check(TokenType.OR):
                    cmd.condition = "||"
                self._advance()
            
            if self._check(TokenType.AMPERSAND):
                cmd.background = True
                self._advance()

        return commands

    def parse_batch(self, commands_text: str) -> List[ParsedCommand]:
        all_commands: List[ParsedCommand] = []
        
        lines = commands_text.split('\n')
        for line_num, line in enumerate(lines, 1):
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            
            try:
                cmds = self.parse(line)
                for cmd in cmds:
                    cmd.line_number = line_num
                all_commands.extend(cmds)
            except Exception as e:
                self.logger.warning(f"Parse error at line {line_num}: {e}")
        
        return all_commands

    def parse_file(self, file_path: str) -> List[ParsedCommand]:
        self.logger.info(f"Parsing command file: {file_path}")
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        return self.parse_batch(content)

    def _parse_command(self) -> ParsedCommand:
        cmd = ParsedCommand(command="")

        if self._check(TokenType.IDENTIFIER):
            cmd.command = self._advance().value.lower()

        if self._check(TokenType.IDENTIFIER):
            cmd.subcommand = self._advance().value.lower()

        while not self._is_at_end() and not self._is_command_separator():
            if self._check(TokenType.FLAG):
                flag_token = self._advance()
                cmd.flags.extend(list(flag_token.value))
            elif self._check(TokenType.OPTION):
                option_token = self._advance()
                option_name = option_token.value
                option_value = True
                
                if self._check(TokenType.EQUALS):
                    self._advance()
                    option_value = self._parse_value()
                elif not self._is_at_end() and not self._is_command_separator():
                    if not self._check(TokenType.FLAG) and not self._check(TokenType.OPTION):
                        option_value = self._parse_value()
                
                cmd.options[option_name] = option_value
            elif self._check(TokenType.LBRACKET):
                cmd.args.append(self._parse_list())
            elif self._check(TokenType.LBRACE):
                cmd.args.append(self._parse_dict())
            else:
                arg_value = self._parse_value()
                if arg_value is not None:
                    cmd.args.append(arg_value)

        if self._check(TokenType.PIPE):
            self._advance()
            cmd.pipeline.append(self._parse_command())

        return cmd

    def _parse_value(self) -> Any:
        if self._check(TokenType.STRING):
            return self._expand_variables(self._advance().value)
        elif self._check(TokenType.NUMBER):
            num_str = self._advance().value
            if '.' in num_str:
                return float(num_str)
            return int(num_str)
        elif self._check(TokenType.IDENTIFIER):
            value = self._advance().value
            if value in self.variables:
                return self.variables[value]
            return self._expand_variables(value)
        return None

    def _parse_list(self) -> List[Any]:
        items: List[Any] = []
        self._advance()

        while not self._is_at_end() and not self._check(TokenType.RBRACKET):
            value = self._parse_value()
            if value is not None:
                items.append(value)
            if self._check(TokenType.COMMA):
                self._advance()

        if self._check(TokenType.RBRACKET):
            self._advance()

        return items

    def _parse_dict(self) -> Dict[str, Any]:
        result: Dict[str, Any] = {}
        self._advance()

        while not self._is_at_end() and not self._check(TokenType.RBRACE):
            key = self._parse_value()
            if self._check(TokenType.COLON):
                self._advance()
                value = self._parse_value()
                if key is not None:
                    result[str(key)] = value
            if self._check(TokenType.COMMA):
                self._advance()

        if self._check(TokenType.RBRACE):
            self._advance()

        return result

    def _expand_variables(self, text: str) -> str:
        import re
        pattern = r'\$\{?(\w+)\}?'
        
        def replace_var(match):
            var_name = match.group(1)
            return str(self.variables.get(var_name, match.group(0)))
        
        return re.sub(pattern, replace_var, str(text))

    def _is_command_separator(self) -> bool:
        return (self._check(TokenType.PIPE) or 
                self._check(TokenType.SEMICOLON) or 
                self._check(TokenType.AND) or 
                self._check(TokenType.OR) or
                self._check(TokenType.AMPERSAND))

    def _check(self, token_type: TokenType) -> bool:
        if self._is_at_end():
            return False
        return self.tokens[self.pos].type == token_type

    def _advance(self) -> Token:
        if not self._is_at_end():
            self.pos += 1
        return self.tokens[self.pos - 1]

    def _is_at_end(self) -> bool:
        return self.pos >= len(self.tokens) or self.tokens[self.pos].type == TokenType.EOF

    def _generate_command_id(self, cmd: ParsedCommand) -> str:
        content = f"{cmd.command}:{cmd.subcommand}:{cmd.args}:{datetime.now().isoformat()}"
        return hashlib.md5(content.encode()).hexdigest()[:12]

    def set_variable(self, name: str, value: Any):
        self.variables[name] = value

    def get_variable(self, name: str) -> Any:
        return self.variables.get(name)

    def parse_and_validate(self, command_line: str, valid_commands: Dict[str, Any]) -> List[ParsedCommand]:
        commands = self.parse(command_line)
        
        for cmd in commands:
            if cmd.command not in valid_commands:
                raise ValueError(f"Unknown command: {cmd.command}")
        
        return commands


class BatchExecutor:
    def __init__(self, parser: Optional[CommandParser] = None):
        self.parser = parser or CommandParser()
        self.logger = get_logger("BatchExecutor")
        self._executor: Optional[Callable] = None
        self.checkpoint_path: Optional[str] = None
        self.executed_commands: set = set()

    def set_executor(self, executor: Callable[[ParsedCommand], bool]):
        self._executor = executor

    def set_checkpoint_path(self, path: str):
        self.checkpoint_path = path
        self._load_checkpoint()

    def _load_checkpoint(self):
        if self.checkpoint_path and self.checkpoint_path:
            try:
                with open(self.checkpoint_path, 'r') as f:
                    self.executed_commands = set(json.load(f))
                self.logger.info(f"Loaded {len(self.executed_commands)} checkpoints")
            except FileNotFoundError:
                self.executed_commands = set()
            except Exception as e:
                self.logger.warning(f"Failed to load checkpoint: {e}")
                self.executed_commands = set()

    def _save_checkpoint(self):
        if self.checkpoint_path:
            try:
                with open(self.checkpoint_path, 'w') as f:
                    json.dump(list(self.executed_commands), f)
            except Exception as e:
                self.logger.warning(f"Failed to save checkpoint: {e}")

    def execute_batch(self, commands: List[ParsedCommand], 
                      stop_on_error: bool = True,
                      resume: bool = False) -> BatchResult:
        result = BatchResult(
            batch_id=self._generate_batch_id(),
            total_commands=len(commands),
            start_time=datetime.now(),
        )

        self.logger.info(f"Executing batch {result.batch_id} with {len(commands)} commands")

        for i, cmd in enumerate(commands):
            if resume and cmd.command_id in self.executed_commands:
                self.logger.info(f"Skipping command {i+1} (already executed)")
                result.executed_commands += 1
                continue

            try:
                if self._executor:
                    success = self._executor(cmd)
                else:
                    success = self._default_executor(cmd)

                result.results.append({
                    "command_id": cmd.command_id,
                    "command": cmd.command,
                    "subcommand": cmd.subcommand,
                    "success": success,
                })

                if success:
                    result.executed_commands += 1
                    self.executed_commands.add(cmd.command_id)
                    if i % 10 == 0:
                        self._save_checkpoint()
                else:
                    result.failed_commands += 1
                    if stop_on_error:
                        self.logger.error(f"Batch stopped at command {i+1} due to error")
                        break

            except Exception as e:
                self.logger.error(f"Error executing command {i+1}: {e}")
                result.failed_commands += 1
                result.results.append({
                    "command_id": cmd.command_id,
                    "command": cmd.command,
                    "error": str(e),
                    "success": False,
                })
                if stop_on_error:
                    break

        result.end_time = datetime.now()
        self._save_checkpoint()

        self.logger.info(
            f"Batch {result.batch_id} complete: "
            f"{result.executed_commands} executed, {result.failed_commands} failed"
        )

        return result

    def _default_executor(self, cmd: ParsedCommand) -> bool:
        self.logger.info(f"Would execute: {cmd.command} {cmd.subcommand}")
        return True

    def _generate_batch_id(self) -> str:
        content = f"batch:{datetime.now().isoformat()}"
        return hashlib.md5(content.encode()).hexdigest()[:10]
