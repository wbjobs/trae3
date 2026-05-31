use serde::{Deserialize, Serialize};
use similar::{ChangeTag, TextDiff};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffLine {
    pub line_number: u32,
    pub content: String,
    pub change_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffResult {
    pub old_lines: Vec<DiffLine>,
    pub new_lines: Vec<DiffLine>,
    pub unified: Vec<DiffLine>,
    pub stats: DiffStats,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffStats {
    pub additions: usize,
    pub deletions: usize,
    pub modifications: usize,
    pub total: usize,
    pub similarity: f64,
}

pub fn compute_diff(old_text: &str, new_text: &str) -> DiffResult {
    let diff = TextDiff::from_lines(old_text, new_text);
    
    let mut old_lines = Vec::new();
    let mut new_lines = Vec::new();
    let mut unified = Vec::new();
    let mut additions = 0;
    let mut deletions = 0;
    let mut modifications = 0;
    
    let mut old_line_num = 1;
    let mut new_line_num = 1;
    
    for change in diff.iter_all_changes() {
        let content = change.to_string();
        let change_type = match change.tag() {
            ChangeTag::Delete => {
                deletions += 1;
                "delete".to_string()
            }
            ChangeTag::Insert => {
                additions += 1;
                "insert".to_string()
            }
            ChangeTag::Equal => "equal".to_string(),
        };
        
        match change.tag() {
            ChangeTag::Delete => {
                old_lines.push(DiffLine {
                    line_number: old_line_num,
                    content: content.clone(),
                    change_type: change_type.clone(),
                });
                unified.push(DiffLine {
                    line_number: old_line_num,
                    content,
                    change_type,
                });
                old_line_num += 1;
            }
            ChangeTag::Insert => {
                new_lines.push(DiffLine {
                    line_number: new_line_num,
                    content: content.clone(),
                    change_type: change_type.clone(),
                });
                unified.push(DiffLine {
                    line_number: new_line_num,
                    content,
                    change_type,
                });
                new_line_num += 1;
            }
            ChangeTag::Equal => {
                old_lines.push(DiffLine {
                    line_number: old_line_num,
                    content: content.clone(),
                    change_type: change_type.clone(),
                });
                new_lines.push(DiffLine {
                    line_number: new_line_num,
                    content: content.clone(),
                    change_type: change_type.clone(),
                });
                unified.push(DiffLine {
                    line_number: old_line_num,
                    content,
                    change_type,
                });
                old_line_num += 1;
                new_line_num += 1;
            }
        }
    }
    
    let total_lines = std::cmp::max(old_text.lines().count(), new_text.lines().count());
    let equal_lines = diff.ops().iter()
        .filter(|op| op.tag() == ChangeTag::Equal)
        .map(|op| op.as_equal().map_or(0, |e| e.old_range().len()))
        .sum::<usize>();
    
    let similarity = if total_lines > 0 {
        (equal_lines as f64 / total_lines as f64) * 100.0
    } else {
        100.0
    };
    
    DiffResult {
        old_lines,
        new_lines,
        unified,
        stats: DiffStats {
            additions,
            deletions,
            modifications,
            total: total_lines,
            similarity,
        },
    }
}

pub fn compute_diff_words(old_text: &str, new_text: &str) -> Vec<(String, String)> {
    let diff = TextDiff::from_words(old_text, new_text);
    
    diff.iter_all_changes()
        .map(|change| {
            let change_type = match change.tag() {
                ChangeTag::Delete => "delete".to_string(),
                ChangeTag::Insert => "insert".to_string(),
                ChangeTag::Equal => "equal".to_string(),
            };
            (change.to_string(), change_type)
        })
        .collect()
}

pub fn generate_patch(old_text: &str, new_text: &str) -> String {
    let diff = TextDiff::from_lines(old_text, new_text);
    diff.unified_diff()
        .header("old", "new")
        .to_string()
}

pub fn apply_patch(original: &str, patch: &str) -> Result<String, String> {
    let mut result = original.to_string();
    
    for line in patch.lines() {
        if line.starts_with("---") || line.starts_with("+++") || line.starts_with("@@") {
            continue;
        }
        
        if let Some(stripped) = line.strip_prefix('-') {
            result = result.replacen(stripped, "", 1);
        } else if let Some(stripped) = line.strip_prefix('+') {
            result.push_str(stripped);
            result.push('\n');
        }
    }
    
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_basic_diff() {
        let old = "line1\nline2\nline3";
        let new = "line1\nline2 modified\nline3\nline4";
        
        let result = compute_diff(old, new);
        
        assert_eq!(result.stats.additions, 1);
        assert_eq!(result.stats.deletions, 1);
    }
    
    #[test]
    fn test_same_content() {
        let text = "line1\nline2";
        let result = compute_diff(text, text);
        
        assert_eq!(result.stats.additions, 0);
        assert_eq!(result.stats.deletions, 0);
        assert_eq!(result.stats.similarity, 100.0);
    }
    
    #[test]
    fn test_generate_patch() {
        let old = "line1\nline2";
        let new = "line1\nline2 modified";
        
        let patch = generate_patch(old, new);
        assert!(patch.contains("line2 modified"));
    }
}
