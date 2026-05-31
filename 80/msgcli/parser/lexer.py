from enum import Enum
from typing import List, Tuple


class TokenType(Enum):
    IDENTIFIER = "IDENTIFIER"
    STRING = "STRING"
    NUMBER = "NUMBER"
    FLAG = "FLAG"
    OPTION = "OPTION"
    PIPE = "PIPE"
    SEMICOLON = "SEMICOLON"
    LBRACKET = "LBRACKET"
    RBRACKET = "RBRACKET"
    LBRACE = "LBRACE"
    RBRACE = "RBRACE"
    LPAREN = "LPAREN"
    RPAREN = "RPAREN"
    EQUALS = "EQUALS"
    COMMA = "COMMA"
    COLON = "COLON"
    AMPERSAND = "AMPERSAND"
    AND = "AND"
    OR = "OR"
    NOT = "NOT"
    EOF = "EOF"


class Token:
    def __init__(self, type: TokenType, value: str, position: int, line: int = 1, column: int = 1):
        self.type = type
        self.value = value
        self.position = position
        self.line = line
        self.column = column

    def __repr__(self):
        return f"Token({self.type}, {self.value!r}, pos={self.position}, line={self.line}, col={self.column})"


class Lexer:
    def __init__(self, input_text: str):
        self.input = input_text
        self.pos = 0
        self.line = 1
        self.column = 1
        self.tokens: List[Token] = []

    def _update_position(self, char: str):
        if char == '\n':
            self.line += 1
            self.column = 1
        else:
            self.column += 1
        self.pos += 1

    def tokenize(self) -> List[Token]:
        while self.pos < len(self.input):
            char = self.input[self.pos]

            if char.isspace():
                self._update_position(char)
                continue

            start_pos = self.pos
            start_line = self.line
            start_col = self.column

            if char == '"' or char == "'":
                self._read_string(char, start_pos, start_line, start_col)
                continue

            if char == '-' and self.pos + 1 < len(self.input):
                next_char = self.input[self.pos + 1]
                if next_char == '-':
                    self._read_option(start_pos, start_line, start_col)
                    continue
                elif next_char.isalpha():
                    self._read_flag(start_pos, start_line, start_col)
                    continue

            if char.isdigit() or (char == '-' and self.pos + 1 < len(self.input) and self.input[self.pos + 1].isdigit()):
                self._read_number(start_pos, start_line, start_col)
                continue

            if char == '|':
                if self.pos + 1 < len(self.input) and self.input[self.pos + 1] == '|':
                    self.tokens.append(Token(TokenType.OR, "||", start_pos, start_line, start_col))
                    self._update_position(char)
                    self._update_position(self.input[self.pos])
                else:
                    self.tokens.append(Token(TokenType.PIPE, char, start_pos, start_line, start_col))
                    self._update_position(char)
                continue

            if char == '&':
                if self.pos + 1 < len(self.input) and self.input[self.pos + 1] == '&':
                    self.tokens.append(Token(TokenType.AND, "&&", start_pos, start_line, start_col))
                    self._update_position(char)
                    self._update_position(self.input[self.pos])
                else:
                    self.tokens.append(Token(TokenType.AMPERSAND, char, start_pos, start_line, start_col))
                    self._update_position(char)
                continue

            if char == '!':
                if self.pos + 1 < len(self.input) and self.input[self.pos + 1] == '=':
                    pass
                else:
                    self.tokens.append(Token(TokenType.NOT, "!", start_pos, start_line, start_col))
                    self._update_position(char)
                continue

            if char == ';':
                self.tokens.append(Token(TokenType.SEMICOLON, char, start_pos, start_line, start_col))
                self._update_position(char)
                continue

            if char == '[':
                self.tokens.append(Token(TokenType.LBRACKET, char, start_pos, start_line, start_col))
                self._update_position(char)
                continue

            if char == ']':
                self.tokens.append(Token(TokenType.RBRACKET, char, start_pos, start_line, start_col))
                self._update_position(char)
                continue

            if char == '{':
                self.tokens.append(Token(TokenType.LBRACE, char, start_pos, start_line, start_col))
                self._update_position(char)
                continue

            if char == '}':
                self.tokens.append(Token(TokenType.RBRACE, char, start_pos, start_line, start_col))
                self._update_position(char)
                continue

            if char == '(':
                self.tokens.append(Token(TokenType.LPAREN, char, start_pos, start_line, start_col))
                self._update_position(char)
                continue

            if char == ')':
                self.tokens.append(Token(TokenType.RPAREN, char, start_pos, start_line, start_col))
                self._update_position(char)
                continue

            if char == '=':
                self.tokens.append(Token(TokenType.EQUALS, char, start_pos, start_line, start_col))
                self._update_position(char)
                continue

            if char == ',':
                self.tokens.append(Token(TokenType.COMMA, char, start_pos, start_line, start_col))
                self._update_position(char)
                continue

            if char == ':':
                self.tokens.append(Token(TokenType.COLON, char, start_pos, start_line, start_col))
                self._update_position(char)
                continue

            if char.isalpha() or char == '_':
                self._read_identifier(start_pos, start_line, start_col)
                continue

            self._update_position(char)

        self.tokens.append(Token(TokenType.EOF, "", self.pos, self.line, self.column))
        return self.tokens

    def _read_string(self, quote_char: str, start_pos: int, start_line: int, start_col: int):
        self._update_position(quote_char)
        value = ""

        while self.pos < len(self.input) and self.input[self.pos] != quote_char:
            char = self.input[self.pos]
            if char == '\\' and self.pos + 1 < len(self.input):
                self._update_position(char)
                next_char = self.input[self.pos]
                escape_map = {'n': '\n', 't': '\t', 'r': '\r', '\\': '\\', '"': '"', "'": "'"}
                value += escape_map.get(next_char, next_char)
                self._update_position(next_char)
            else:
                value += char
                self._update_position(char)

        if self.pos < len(self.input):
            self._update_position(self.input[self.pos])

        self.tokens.append(Token(TokenType.STRING, value, start_pos, start_line, start_col))

    def _read_identifier(self, start_pos: int, start_line: int, start_col: int):
        value = ""

        while self.pos < len(self.input) and (self.input[self.pos].isalnum() or self.input[self.pos] in '_-.'):
            value += self.input[self.pos]
            self._update_position(self.input[self.pos - 1])

        self.tokens.append(Token(TokenType.IDENTIFIER, value, start_pos, start_line, start_col))

    def _read_flag(self, start_pos: int, start_line: int, start_col: int):
        self._update_position('-')
        value = ""

        while self.pos < len(self.input) and self.input[self.pos].isalpha():
            value += self.input[self.pos]
            self._update_position(self.input[self.pos - 1])

        self.tokens.append(Token(TokenType.FLAG, value, start_pos, start_line, start_col))

    def _read_option(self, start_pos: int, start_line: int, start_col: int):
        self._update_position('-')
        self._update_position('-')
        value = ""

        while self.pos < len(self.input) and (self.input[self.pos].isalnum() or self.input[self.pos] in '-'):
            value += self.input[self.pos]
            self._update_position(self.input[self.pos - 1])

        self.tokens.append(Token(TokenType.OPTION, value, start_pos, start_line, start_col))

    def _read_number(self, start_pos: int, start_line: int, start_col: int):
        value = ""

        if self.input[self.pos] == '-':
            value += '-'
            self._update_position('-')

        while self.pos < len(self.input) and (self.input[self.pos].isdigit() or self.input[self.pos] == '.'):
            value += self.input[self.pos]
            self._update_position(self.input[self.pos - 1])

        self.tokens.append(Token(TokenType.NUMBER, value, start_pos, start_line, start_col))
