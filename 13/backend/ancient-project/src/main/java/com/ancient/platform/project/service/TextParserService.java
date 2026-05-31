package com.ancient.platform.project.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Slf4j
@Service
public class TextParserService {

    private static final Pattern CHINESE_PATTERN = Pattern.compile("[\\u4e00-\\u9fa5]");
    private static final Pattern PUNCTUATION_PATTERN = Pattern.compile("[\\u3000-\\u303f\\uff00-\\uffef]");
    private static final Pattern WHITESPACE_PATTERN = Pattern.compile("\\s+");

    public String parsePlainText(String rawText) {
        if (rawText == null || rawText.isBlank()) {
            return "";
        }
        String text = rawText.trim();
        text = WHITESPACE_PATTERN.matcher(text).replaceAll("");
        text = text.replaceAll("[\\r\\n]+", "\n");
        return text;
    }

    public String parseOcrResult(String ocrJson) {
        if (ocrJson == null || ocrJson.isBlank()) {
            return "";
        }
        StringBuilder sb = new StringBuilder();
        String[] lines = ocrJson.split("\\\\n|\\n");
        for (String line : lines) {
            String cleaned = line.trim()
                    .replaceAll("[\\[{\"'}\\]]", "")
                    .replaceAll("confidence[:\\s]*[0-9.]+", "")
                    .replaceAll("text[:\\s]*", "")
                    .trim();
            if (!cleaned.isEmpty()) {
                sb.append(cleaned);
            }
        }
        return sb.toString();
    }

    public String generateDiff(String text1, String text2) {
        if (text1 == null) text1 = "";
        if (text2 == null) text2 = "";

        if (text1.equals(text2)) {
            return "[]";
        }

        List<DiffEntry> diffs = computeDiff(text1, text2);
        StringBuilder jsonBuilder = new StringBuilder("[");
        for (int i = 0; i < diffs.size(); i++) {
            if (i > 0) jsonBuilder.append(",");
            DiffEntry entry = diffs.get(i);
            jsonBuilder.append("{\"op\":\"").append(entry.operation)
                    .append("\",\"text\":\"").append(escapeJson(entry.text))
                    .append("\"}");
        }
        jsonBuilder.append("]");
        return jsonBuilder.toString();
    }

    private List<DiffEntry> computeDiff(String text1, String text2) {
        List<DiffEntry> diffs = new ArrayList<>();
        int[][] dp = buildLCSMatrix(text1, text2);
        backtrack(diffs, text1, text2, dp, text1.length(), text2.length());
        return mergeDiffs(diffs);
    }

    private int[][] buildLCSMatrix(String s1, String s2) {
        int m = s1.length();
        int n = s2.length();
        int[][] dp = new int[m + 1][n + 1];
        for (int i = 1; i <= m; i++) {
            for (int j = 1; j <= n; j++) {
                if (s1.charAt(i - 1) == s2.charAt(j - 1)) {
                    dp[i][j] = dp[i - 1][j - 1] + 1;
                } else {
                    dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
                }
            }
        }
        return dp;
    }

    private void backtrack(List<DiffEntry> diffs, String s1, String s2, int[][] dp, int i, int j) {
        if (i > 0 && j > 0 && s1.charAt(i - 1) == s2.charAt(j - 1)) {
            backtrack(diffs, s1, s2, dp, i - 1, j - 1);
            diffs.add(new DiffEntry("equal", String.valueOf(s1.charAt(i - 1))));
        } else if (j > 0 && (i == 0 || dp[i][j - 1] >= dp[i - 1][j])) {
            backtrack(diffs, s1, s2, dp, i, j - 1);
            diffs.add(new DiffEntry("insert", String.valueOf(s2.charAt(j - 1))));
        } else if (i > 0) {
            backtrack(diffs, s1, s2, dp, i - 1, j);
            diffs.add(new DiffEntry("delete", String.valueOf(s1.charAt(i - 1))));
        }
    }

    private List<DiffEntry> mergeDiffs(List<DiffEntry> diffs) {
        if (diffs.isEmpty()) return diffs;
        List<DiffEntry> merged = new ArrayList<>();
        DiffEntry current = diffs.get(0);
        for (int i = 1; i < diffs.size(); i++) {
            DiffEntry next = diffs.get(i);
            if (current.operation.equals(next.operation)) {
                current = new DiffEntry(current.operation, current.text + next.text);
            } else {
                merged.add(current);
                current = next;
            }
        }
        merged.add(current);
        return merged;
    }

    private String escapeJson(String text) {
        return text.replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\n", "\\n")
                .replace("\r", "\\r")
                .replace("\t", "\\t");
    }

    private static class DiffEntry {
        final String operation;
        final String text;

        DiffEntry(String operation, String text) {
            this.operation = operation;
            this.text = text;
        }
    }
}
