use crate::models::*;
use anyhow::Result;

pub async fn parse(content: &str, language: &str) -> ParseResult {
    match language.to_lowercase().as_str() {
        "javascript" | "typescript" => parse_javascript(content),
        "python" => parse_python(content),
        _ => ParseResult {
            success: true,
            ast: None,
            errors: vec![],
            tokens: vec![],
        },
    }
}

fn parse_javascript(content: &str) -> ParseResult {
    let mut tokens = Vec::new();
    let mut errors = Vec::new();
    let mut position = 0;
    let mut line = 1;
    let mut column = 1;
    
    let chars: Vec<char> = content.chars().collect();
    
    while position < chars.len() {
        let c = chars[position];
        
        if c == ' ' || c == '\t' || c == '\r' {
            position += 1;
            column += 1;
            continue;
        }
        
        if c == '\n' {
            position += 1;
            line += 1;
            column = 1;
            continue;
        }
        
        let pos = Position {
            line: line as i32,
            column: column as i32,
            offset: position as i32,
        };
        
        if c == '/' && position + 1 < chars.len() && chars[position + 1] == '/' {
            while position < chars.len() && chars[position] != '\n' {
                position += 1;
            }
            continue;
        }
        
        if c == '/' && position + 1 < chars.len() && chars[position + 1] == '*' {
            position += 2;
            column += 2;
            while position + 1 < chars.len() && !(chars[position] == '*' && chars[position + 1] == '/') {
                if chars[position] == '\n' {
                    line += 1;
                    column = 1;
                } else {
                    column += 1;
                }
                position += 1;
            }
            position += 2;
            column += 2;
            continue;
        }
        
        if c == '"' || c == '\'' || c == '`' {
            let quote = c;
            let start = position;
            position += 1;
            column += 1;
            
            while position < chars.len() {
                if chars[position] == '\\' {
                    position += 2;
                    column += 2;
                } else if chars[position] == quote {
                    position += 1;
                    column += 1;
                    break;
                } else if chars[position] == '\n' {
                    line += 1;
                    column = 1;
                    position += 1;
                } else {
                    position += 1;
                    column += 1;
                }
            }
            
            let value: String = chars[start + 1..position - 1].iter().collect();
            tokens.push(Token {
                r#type: "String".to_string(),
                value,
                position: pos,
            });
            continue;
        }
        
        if c.is_ascii_digit() {
            let start = position;
            while position < chars.len() && (chars[position].is_ascii_digit() || chars[position] == '.') {
                position += 1;
                column += 1;
            }
            let value: String = chars[start..position].iter().collect();
            tokens.push(Token {
                r#type: "Number".to_string(),
                value,
                position: pos,
            });
            continue;
        }
        
        if c.is_ascii_alphabetic() || c == '_' || c == '$' {
            let start = position;
            while position < chars.len() && (chars[position].is_ascii_alphanumeric() || chars[position] == '_' || chars[position] == '$') {
                position += 1;
                column += 1;
            }
            let value: String = chars[start..position].iter().collect();
            let keywords = vec!["const", "let", "var", "function", "return", "if", "else", "for", "while", "class"];
            let token_type = if keywords.contains(&value.as_str()) { "Keyword" } else { "Identifier" };
            tokens.push(Token {
                r#type: token_type.to_string(),
                value,
                position: pos,
            });
            continue;
        }
        
        let punctuators = vec!["===", "!==", "==", "!=", "<=", ">=", "&&", "||", "=>", "++", "--", "+=", "-=", "*=", "/="];
        let mut matched = false;
        for p in &punctuators {
            let end = position + p.len();
            if end <= chars.len() {
                let slice: String = chars[position..end].iter().collect();
                if slice == *p {
                    tokens.push(Token {
                        r#type: "Punctuator".to_string(),
                        value: p.to_string(),
                        position: pos,
                    });
                    position += p.len();
                    column += p.len() as i32;
                    matched = true;
                    break;
                }
            }
        }
        
        if !matched {
            if "{}[]();,:.".contains(c) {
                tokens.push(Token {
                    r#type: "Punctuator".to_string(),
                    value: c.to_string(),
                    position: pos,
                });
                position += 1;
                column += 1;
            } else {
                errors.push(ParseError {
                    message: format!("Unexpected character: {}", c),
                    severity: "error".to_string(),
                    position: pos.clone(),
                    code: Some("UNEXPECTED_CHAR".to_string()),
                });
                position += 1;
                column += 1;
            }
        }
    }
    
    ParseResult {
        success: errors.is_empty(),
        ast: None,
        errors,
        tokens,
    }
}

fn parse_python(content: &str) -> ParseResult {
    let mut tokens = Vec::new();
    let mut errors = Vec::new();
    let mut position = 0;
    let mut line = 1;
    let mut column = 1;
    
    let chars: Vec<char> = content.chars().collect();
    
    while position < chars.len() {
        let c = chars[position];
        
        if c == '\n' {
            position += 1;
            line += 1;
            column = 1;
            
            let mut indent = 0;
            let mut indent_pos = position;
            while indent_pos < chars.len() && (chars[indent_pos] == ' ' || chars[indent_pos] == '\t') {
                indent += 1;
                indent_pos += 1;
            }
            
            tokens.push(Token {
                r#type: "Newline".to_string(),
                value: "\n".to_string(),
                position: Position {
                    line: line as i32,
                    column: 1,
                    offset: position as i32,
                },
            });
            
            column = indent as i32 + 1;
            continue;
        }
        
        if c == ' ' || c == '\t' || c == '\r' {
            position += 1;
            column += 1;
            continue;
        }
        
        let pos = Position {
            line: line as i32,
            column: column as i32,
            offset: position as i32,
        };
        
        if c == '#' {
            while position < chars.len() && chars[position] != '\n' {
                position += 1;
            }
            continue;
        }
        
        if c == '"' || c == '\'' {
            let quote = c;
            let is_triple = position + 2 < chars.len() && chars[position + 1] == quote && chars[position + 2] == quote;
            
            let start = position;
            if is_triple {
                position += 3;
                column += 3;
                while position + 2 < chars.len() && !(chars[position] == quote && chars[position + 1] == quote && chars[position + 2] == quote) {
                    if chars[position] == '\n' {
                        line += 1;
                        column = 1;
                    } else {
                        column += 1;
                    }
                    position += 1;
                }
                position += 3;
            } else {
                position += 1;
                column += 1;
                while position < chars.len() {
                    if chars[position] == '\\' {
                        position += 2;
                        column += 2;
                    } else if chars[position] == quote {
                        position += 1;
                        column += 1;
                        break;
                    } else if chars[position] == '\n' {
                        errors.push(ParseError {
                            message: "Unterminated string literal".to_string(),
                            severity: "error".to_string(),
                            position: pos.clone(),
                            code: Some("UNTERMINATED_STRING".to_string()),
                        });
                        break;
                    } else {
                        position += 1;
                        column += 1;
                    }
                }
            }
            
            let value: String = chars[start..position].iter().collect();
            tokens.push(Token {
                r#type: "String".to_string(),
                value,
                position: pos,
            });
            continue;
        }
        
        if c.is_ascii_digit() {
            let start = position;
            while position < chars.len() && (chars[position].is_ascii_digit() || chars[position] == '.' || chars[position] == 'e' || chars[position] == 'E' || chars[position] == '+' || chars[position] == '-') {
                position += 1;
                column += 1;
            }
            let value: String = chars[start..position].iter().collect();
            tokens.push(Token {
                r#type: "Number".to_string(),
                value,
                position: pos,
            });
            continue;
        }
        
        if c.is_ascii_alphabetic() || c == '_' {
            let start = position;
            while position < chars.len() && (chars[position].is_ascii_alphanumeric() || chars[position] == '_') {
                position += 1;
                column += 1;
            }
            let value: String = chars[start..position].iter().collect();
            let keywords = vec!["def", "class", "return", "if", "elif", "else", "for", "while", "import", "from", "as", "try", "except", "finally", "with", "pass", "lambda", "yield", "True", "False", "None"];
            let token_type = if keywords.contains(&value.as_str()) { "Keyword" } else { "Identifier" };
            tokens.push(Token {
                r#type: token_type.to_string(),
                value,
                position: pos,
            });
            continue;
        }
        
        let punctuators = vec!["==", "!=", "<=", ">=", "**", "//", "->", "+=", "-=", "*=", "/=", "%=", "&=", "|=", "^="];
        let mut matched = false;
        for p in &punctuators {
            let end = position + p.len();
            if end <= chars.len() {
                let slice: String = chars[position..end].iter().collect();
                if slice == *p {
                    tokens.push(Token {
                        r#type: "Punctuator".to_string(),
                        value: p.to_string(),
                        position: pos,
                    });
                    position += p.len();
                    column += p.len() as i32;
                    matched = true;
                    break;
                }
            }
        }
        
        if !matched {
            if "{}[]():,;:.+-*/%<>=&|^~@".contains(c) {
                tokens.push(Token {
                    r#type: "Punctuator".to_string(),
                    value: c.to_string(),
                    position: pos,
                });
                position += 1;
                column += 1;
            } else {
                errors.push(ParseError {
                    message: format!("Unexpected character: {}", c),
                    severity: "error".to_string(),
                    position: pos.clone(),
                    code: Some("UNEXPECTED_CHAR".to_string()),
                });
                position += 1;
                column += 1;
            }
        }
    }
    
    ParseResult {
        success: errors.is_empty(),
        ast: None,
        errors,
        tokens,
    }
}

pub async fn format(content: &str, language: &str) -> Result<String> {
    match language.to_lowercase().as_str() {
        "json" => {
            let parsed: serde_json::Value = serde_json::from_str(content)?;
            Ok(serde_json::to_string_pretty(&parsed)?)
        }
        _ => Ok(content.to_string()),
    }
}
