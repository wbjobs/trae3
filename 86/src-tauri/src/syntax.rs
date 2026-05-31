use crate::models::*;
use once_cell::sync::Lazy;
use regex::Regex;
use rayon::prelude::*;

static DEBUG_PATTERNS: Lazy<Vec<(Regex, &'static str)>> = Lazy::new(|| {
    vec![
        (Regex::new(r"console\.(log|debug|warn|error)").unwrap(), "Debug code: console statement"),
        (Regex::new(r"print\s*\(").unwrap(), "Debug code: print statement"),
        (Regex::new(r"debugger;").unwrap(), "Debug code: debugger statement"),
    ]
});

static TODO_PATTERN: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(TODO|FIXME|HACK|NOTE):?\s*(.+)").unwrap()
});

static EVAL_PATTERN: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"\beval\s*\(").unwrap()
});

static EQ_PATTERN: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"[^=!]==[^=]").unwrap()
});

static FUNC_PATTERN: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"function\s+(\w+)\s*\(([^)]*)\)\s*\{").unwrap()
});

static CAMEL_CASE_PATTERN: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"^def\s+([A-Za-z]*[A-Z][A-Za-z]*)\s*\(").unwrap()
});

static SQL_INJECTION_PATTERNS: Lazy<Vec<Regex>> = Lazy::new(|| {
    vec![
        Regex::new(r#"["']\s*\+\s*\w+\s*\+\s*["']"#).unwrap(),
        Regex::new(r"\$\{[^}]+\}").unwrap(),
    ]
});

static SECRET_PATTERNS: Lazy<Vec<(Regex, &'static str)>> = Lazy::new(|| {
    vec![
        (Regex::new(r#"(password|pwd|passwd)\s*[:=]\s*["'][^"']{3,}["']"#).unwrap(), "Hardcoded password detected"),
        (Regex::new(r#"(api_key|apikey|apiKey)\s*[:=]\s*["'][^"']{20,}["']"#).unwrap(), "Hardcoded API key detected"),
        (Regex::new(r#"(secret|token)\s*[:=]\s*["'][^"']{20,}["']"#).unwrap(), "Hardcoded secret/token detected"),
        (Regex::new(r"-----BEGIN (RSA |EC )?PRIVATE KEY-----").unwrap(), "Private key detected"),
    ]
});

static COMPLEXITY_PATTERNS: Lazy<Vec<Regex>> = Lazy::new(|| {
    vec![
        Regex::new(r"\bif\s*\(").unwrap(),
        Regex::new(r"\belse\s+if\s*\(").unwrap(),
        Regex::new(r"\bfor\s*\(").unwrap(),
        Regex::new(r"\bwhile\s*\(").unwrap(),
        Regex::new(r"\bswitch\s*\(").unwrap(),
        Regex::new(r"\bcase\b").unwrap(),
        Regex::new(r"\bcatch\s*\(").unwrap(),
        Regex::new(r"\b&&\b").unwrap(),
        Regex::new(r"\b\|\|\b").unwrap(),
        Regex::new(r"\?[^:]+:").unwrap(),
    ]
});

pub async fn check(content: &str, language: &str) -> SyntaxCheckResult {
    let mut errors = Vec::new();
    let mut suggestions = Vec::new();
    
    if content.is_empty() {
        return SyntaxCheckResult {
            is_valid: true,
            errors,
            suggestions,
        };
    }
    
    let result = std::panic::catch_unwind(|| {
        let content = content.to_string();
        let language = language.to_string();
        
        rayon::spawn(move || {
            let mut errors = Vec::new();
            let mut suggestions = Vec::new();
            
            check_basic_rules_fast(&content, &mut errors, &mut suggestions);
            
            match language.to_lowercase().as_str() {
                "javascript" | "typescript" => check_javascript_fast(&content, &mut errors, &mut suggestions),
                "python" => check_python_fast(&content, &mut errors, &mut suggestions),
                "sql" => check_sql_fast(&content, &mut errors, &mut suggestions),
                _ => {}
            }
            
            check_security_rules_fast(&content, &mut errors, &mut suggestions);
            
            (errors, suggestions)
        })
    });
    
    match result {
        Ok(handle) => {
            if let Ok((e, s)) = tokio::task::spawn_blocking(move || handle.join()).await.unwrap() {
                errors = e;
                suggestions = s;
            }
        }
        Err(e) => {
            errors.push(ParseError {
                message: format!("Syntax check panicked: {:?}", e),
                severity: "error".to_string(),
                position: Position { line: 1, column: 1, offset: 0 },
                code: Some("INTERNAL_ERROR".to_string()),
            });
        }
    }
    
    SyntaxCheckResult {
        is_valid: errors.iter().all(|e| e.severity != "error"),
        errors,
        suggestions,
    }
}

fn check_basic_rules_fast(content: &str, errors: &mut Vec<ParseError>, suggestions: &mut Vec<Suggestion>) {
    let lines: Vec<&str> = content.lines().collect();
    
    let line_results: Vec<Vec<ParseError>> = lines.par_iter().enumerate().map(|(i, line)| {
        let mut line_errors = Vec::new();
        let line_num = (i + 1) as i32;
        
        if line.len() > 120 {
            line_errors.push(ParseError {
                message: format!("Line too long ({} characters)", line.len()),
                severity: "warning".to_string(),
                position: Position { line: line_num, column: 121, offset: 0 },
                code: Some("LINE_TOO_LONG".to_string()),
            });
        }
        
        if line.ends_with(' ') {
            line_errors.push(ParseError {
                message: "Trailing whitespace".to_string(),
                severity: "warning".to_string(),
                position: Position { line: line_num, column: line.len() as i32, offset: 0 },
                code: Some("TRAILING_WHITESPACE".to_string()),
            });
        }
        
        if line.contains('\t') {
            line_errors.push(ParseError {
                message: "Use spaces instead of tabs".to_string(),
                severity: "warning".to_string(),
                position: Position { line: line_num, column: 1, offset: 0 },
                code: Some("TAB_USED".to_string()),
            });
        }
        
        line_errors
    }).collect();
    
    for line_errors in line_results {
        errors.extend(line_errors);
    }
    
    if !content.is_empty() && !content.ends_with('\n') {
        errors.push(ParseError {
            message: "File should end with a newline".to_string(),
            severity: "info".to_string(),
            position: Position { line: lines.len() as i32, column: 1, offset: 0 },
            code: Some("NO_NEWLINE_AT_END".to_string()),
        });
    }
    
    for (pattern, message) in DEBUG_PATTERNS.iter() {
        for m in pattern.find_iter(content) {
            let pos = find_position_fast(content, m.start());
            errors.push(ParseError {
                message: message.to_string(),
                severity: "info".to_string(),
                position: pos,
                code: Some("DEBUG_CODE".to_string()),
            });
        }
    }
    
    for m in TODO_PATTERN.captures_iter(content) {
        if let (Some(full_match), Some(tag), Some(msg)) = (m.get(0), m.get(1), m.get(2)) {
            let pos = find_position_fast(content, full_match.start());
            suggestions.push(Suggestion {
                message: format!("{}: {}", tag.as_str(), msg.as_str()),
                r#type: "best_practice".to_string(),
                position: pos,
            });
        }
    }
}

fn check_javascript_fast(content: &str, errors: &mut Vec<ParseError>, suggestions: &mut Vec<Suggestion>) {
    check_bracket_matching_fast(content, errors);
    
    for m in EVAL_PATTERN.find_iter(content) {
        let pos = find_position_fast(content, m.start());
        errors.push(ParseError {
            message: "Avoid using eval() due to security risks".to_string(),
            severity: "warning".to_string(),
            position: pos,
            code: Some("EVAL_USED".to_string()),
        });
    }
    
    for m in EQ_PATTERN.find_iter(content) {
        let pos = find_position_fast(content, m.start());
        suggestions.push(Suggestion {
            message: "Use === instead of == to avoid type coercion".to_string(),
            r#type: "best_practice".to_string(),
            position: pos,
        });
    }
    
    for m in FUNC_PATTERN.captures_iter(content) {
        if let (Some(full_match), Some(name_match), Some(params_match)) = (m.get(0), m.get(1), m.get(2)) {
            let params: Vec<&str> = params_match.as_str().split(',').map(|s| s.trim()).filter(|s| !s.is_empty()).collect();
            if params.len() > 5 {
                let pos = find_position_fast(content, full_match.start());
                suggestions.push(Suggestion {
                    message: format!("Function '{}' has too many parameters ({})", name_match.as_str(), params.len()),
                    r#type: "best_practice".to_string(),
                    position: pos,
                });
            }
        }
    }
    
    let complexity = calculate_complexity_fast(content);
    if complexity > 20 {
        suggestions.push(Suggestion {
            message: format!("High cyclomatic complexity ({})", complexity),
            r#type: "performance".to_string(),
            position: Position { line: 1, column: 1, offset: 0 },
        });
    }
}

fn check_python_fast(content: &str, errors: &mut Vec<ParseError>, suggestions: &mut Vec<Suggestion>) {
    let lines: Vec<&str> = content.lines().collect();
    
    for (i, line) in lines.iter().enumerate() {
        let line_num = (i + 1) as i32;
        let trimmed = line.trim_start();
        let indent = line.len() - trimmed.len();
        
        if indent > 0 && line.contains(' ') && line.contains('\t') {
            errors.push(ParseError {
                message: "Mixed tabs and spaces in indentation".to_string(),
                severity: "error".to_string(),
                position: Position { line: line_num, column: 1, offset: 0 },
                code: Some("MIXED_INDENTATION".to_string()),
            });
        }
        
        if !line.contains('\t') && indent % 4 != 0 && !trimmed.is_empty() {
            suggestions.push(Suggestion {
                message: "Use 4 spaces for indentation".to_string(),
                r#type: "style".to_string(),
                position: Position { line: line_num, column: (indent + 1) as i32, offset: 0 },
            });
        }
        
        let keywords = ["def", "class", "if", "elif", "for", "while", "try", "except", "finally", "with"];
        for kw in keywords {
            if trimmed.starts_with(&format!("{} ", kw)) && !trimmed.contains(':') {
                errors.push(ParseError {
                    message: format!("Missing colon after '{}'", kw),
                    severity: "error".to_string(),
                    position: Position { line: line_num, column: line.len() as i32, offset: 0 },
                    code: Some("MISSING_COLON".to_string()),
                });
            }
        }
    }
    
    for m in CAMEL_CASE_PATTERN.captures_iter(content) {
        if let (Some(full_match), Some(name_match)) = (m.get(0), m.get(1)) {
            let pos = find_position_fast(content, full_match.start());
            let name = name_match.as_str();
            suggestions.push(Suggestion {
                message: format!("Function name '{}' should use snake_case", name),
                r#type: "style".to_string(),
                position: pos,
            });
        }
    }
}

fn check_sql_fast(content: &str, errors: &mut Vec<ParseError>, _suggestions: &mut Vec<Suggestion>) {
    for pattern in SQL_INJECTION_PATTERNS.iter() {
        for m in pattern.find_iter(content) {
            let start = std::cmp::max(0, m.start() as isize - 30) as usize;
            let end = std::cmp::min(content.len(), m.end() + 30);
            let context = if start < end {
                &content[start..end].to_lowercase()
            } else {
                ""
            };
            
            if context.contains("select") || context.contains("insert") || context.contains("update") || context.contains("delete") {
                let pos = find_position_fast(content, m.start());
                errors.push(ParseError {
                    message: "Potential SQL injection risk: avoid string concatenation".to_string(),
                    severity: "error".to_string(),
                    position: pos,
                    code: Some("SQL_INJECTION".to_string()),
                });
            }
        }
    }
}

fn check_security_rules_fast(content: &str, errors: &mut Vec<ParseError>, _suggestions: &mut Vec<Suggestion>) {
    for (pattern, message) in SECRET_PATTERNS.iter() {
        for m in pattern.find_iter(content) {
            let pos = find_position_fast(content, m.start());
            errors.push(ParseError {
                message: message.to_string(),
                severity: "error".to_string(),
                position: pos,
                code: Some("HARDCODED_SECRET".to_string()),
            });
        }
    }
}

fn check_bracket_matching_fast(content: &str, errors: &mut Vec<ParseError>) {
    let mut stack: Vec<(char, usize)> = Vec::new();
    
    for (i, c) in content.chars().enumerate() {
        match c {
            '(' | '[' | '{' => stack.push((c, i)),
            ')' | ']' | '}' => {
                if let Some((last_c, last_pos)) = stack.pop() {
                    let expected = match last_c {
                        '(' => ')',
                        '[' => ']',
                        '{' => '}',
                        _ => continue,
                    };
                    if c != expected {
                        let pos = find_position_fast(content, i);
                        errors.push(ParseError {
                            message: format!("Mismatched brackets: expected '{}' but found '{}'", expected, c),
                            severity: "error".to_string(),
                            position: pos,
                            code: Some("MISMATCHED_BRACKET".to_string()),
                        });
                    }
                } else {
                    let pos = find_position_fast(content, i);
                    errors.push(ParseError {
                        message: format!("Unmatched closing bracket '{}'", c),
                        severity: "error".to_string(),
                        position: pos,
                        code: Some("UNMATCHED_BRACKET".to_string()),
                    });
                }
            }
            _ => {}
        }
    }
    
    for (c, pos) in stack {
        let position = find_position_fast(content, pos);
        errors.push(ParseError {
            message: format!("Unmatched opening bracket '{}'", c),
            severity: "error".to_string(),
            position: position,
            code: Some("UNMATCHED_BRACKET".to_string()),
        });
    }
}

fn calculate_complexity_fast(content: &str) -> i32 {
    let mut complexity = 1;
    
    for pattern in COMPLEXITY_PATTERNS.iter() {
        complexity += pattern.find_iter(content).count() as i32;
    }
    
    complexity
}

fn find_position_fast(content: &str, offset: usize) -> Position {
    let mut line = 1;
    let mut column = 1;
    
    for (i, c) in content.chars().enumerate() {
        if i >= offset {
            break;
        }
        if c == '\n' {
            line += 1;
            column = 1;
        } else {
            column += 1;
        }
    }
    
    Position {
        line,
        column,
        offset: offset as i32,
    }
}
