const express = require('express');
const XLSX = require('xlsx');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const { uploadTemp, importDir } = require('../utils/fileStorage');
const { getQuery, runQuery, allQuery } = require('../config/database');
const { validateArchive } = require('../validators/archiveValidator');
const { generateArchiveNumber, getKeywordsFromContent, CATEGORY_CODES } = require('../rules/catalogRules');

const router = express.Router();

function parseDate(dateValue) {
  if (!dateValue) return null;
  
  if (dateValue instanceof Date) {
    return dateValue.toISOString().split('T')[0];
  }
  
  if (typeof dateValue === 'number') {
    const date = XLSX.SSF.parse_date_code(dateValue);
    return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
  }
  
  const dateStr = String(dateValue);
  const patterns = [
    /(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})日?/,
    /(\d{4})(\d{2})(\d{2})/
  ];
  
  for (const pattern of patterns) {
    const match = dateStr.match(pattern);
    if (match) {
      return `${match[1]}-${String(match[2]).padStart(2, '0')}-${String(match[3]).padStart(2, '0')}`;
    }
  }
  
  return null;
}

function normalizeData(row, index) {
  return {
    title: row['标题'] || row['档案标题'] || row['title'] || '',
    category: row['类别'] || row['档案类别'] || row['category'] || '文书档案',
    retentionPeriod: row['保管期限'] || row['retentionPeriod'] || '30年',
    description: row['描述'] || row['档案描述'] || row['description'] || '',
    creator: row['创建人'] || row['creator'] || '系统导入',
    creationDate: parseDate(row['创建日期'] || row['creationDate'] || new Date()),
    department: row['部门'] || row['所属部门'] || row['department'] || '未知部门',
    keywords: row['关键词'] || row['keywords'] ? String(row['关键词'] || row['keywords']).split(/[,，、]/) : [],
    rowNumber: index + 2
  };
}

router.post('/upload', uploadTemp.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: '未上传文件' });
    }

    const taskId = uuidv4();
    const { createdBy = '系统' } = req.body;

    const filePath = req.file.path;
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet);

    if (jsonData.length === 0) {
      fs.unlinkSync(filePath);
      return res.status(400).json({ success: false, error: '文件内容为空' });
    }

    const previewData = jsonData.slice(0, 10).map((row, index) => {
      const normalized = normalizeData(row, index);
      const validation = validateArchive(normalized);
      return {
        ...normalized,
        valid: validation.valid,
        errors: validation.errors
      };
    });

    await runQuery(`
      INSERT INTO import_tasks (
        task_id, file_name, total_count, status, created_by
      ) VALUES (?, ?, ?, ?, ?)
    `, [taskId, req.file.originalname, jsonData.length, 'preview', createdBy]);

    const tempDataPath = path.join(importDir, `${taskId}.json`);
    fs.writeFileSync(tempDataPath, JSON.stringify(jsonData));

    fs.unlinkSync(filePath);

    res.json({
      success: true,
      data: {
        taskId,
        fileName: req.file.originalname,
        totalCount: jsonData.length,
        previewData
      }
    });
  } catch (error) {
    console.error('上传导入文件错误:', error);
    res.status(500).json({ success: false, error: '文件处理失败' });
  }
});

router.post('/confirm/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    const { createdBy = '系统' } = req.body;

    const task = await getQuery('SELECT * FROM import_tasks WHERE task_id = ?', [taskId]);
    if (!task) {
      return res.status(404).json({ success: false, error: '任务不存在' });
    }

    const tempDataPath = path.join(importDir, `${taskId}.json`);
    if (!fs.existsSync(tempDataPath)) {
      return res.status(404).json({ success: false, error: '数据文件不存在' });
    }

    const jsonData = JSON.parse(fs.readFileSync(tempDataPath, 'utf-8'));

    await runQuery(
      'UPDATE import_tasks SET status = ? WHERE task_id = ?',
      ['processing', taskId]
    );

    let successCount = 0;
    let failCount = 0;
    const errors = [];

    const year = new Date().getFullYear();

    for (let i = 0; i < jsonData.length; i++) {
      try {
        const normalized = normalizeData(jsonData[i], i);
        const validation = validateArchive(normalized);

        if (!validation.valid) {
          failCount++;
          errors.push({
            row: i + 2,
            errors: validation.errors
          });
          continue;
        }

        const categoryCode = CATEGORY_CODES[normalized.category] || 'QT';
        const prefix = `${categoryCode}-${year}-`;

        const lastNum = await getQuery(
          "SELECT archive_number FROM archives WHERE archive_number LIKE ? ORDER BY archive_number DESC LIMIT 1",
          [`${prefix}%`]
        );

        let sequence = 1;
        if (lastNum && lastNum.archive_number) {
          const parts = lastNum.archive_number.split('-');
          sequence = parseInt(parts[2], 10) + 1;
        }

        const archiveNumber = generateArchiveNumber(normalized.category, year, sequence);

        const autoKeywords = getKeywordsFromContent(normalized.title, normalized.description || '');
        const allKeywords = [...new Set([...(normalized.keywords || []), ...autoKeywords])];

        const result = await runQuery(`
          INSERT INTO archives (
            archive_number, title, category, retention_period, description,
            creator, creation_date, department, keywords, review_status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          archiveNumber,
          normalized.title,
          normalized.category,
          normalized.retentionPeriod,
          normalized.description,
          normalized.creator,
          normalized.creationDate,
          normalized.department,
          JSON.stringify(allKeywords),
          '待审核'
        ]);

        await runQuery(
          'INSERT INTO operation_logs (archive_id, operation, operator, details) VALUES (?, ?, ?, ?)',
          [result.lastID, '批量导入', createdBy, `从 ${task.file_name} 导入，行号: ${i + 2}`]
        );

        successCount++;
      } catch (err) {
        failCount++;
        errors.push({
          row: i + 2,
          errors: [err.message]
        });
      }
    }

    await runQuery(
      'UPDATE import_tasks SET success_count = ?, fail_count = ?, status = ?, error_log = ?, completed_at = CURRENT_TIMESTAMP WHERE task_id = ?',
      [successCount, failCount, 'completed', JSON.stringify(errors), taskId]
    );

    fs.unlinkSync(tempDataPath);

    res.json({
      success: true,
      data: {
        taskId,
        totalCount: task.total_count,
        successCount,
        failCount,
        errors
      }
    });
  } catch (error) {
    console.error('确认导入错误:', error);
    res.status(500).json({ success: false, error: '导入失败' });
  }
});

router.get('/tasks', async (req, res) => {
  try {
    const { page = 1, pageSize = 20 } = req.query;
    const offset = (page - 1) * pageSize;

    const tasks = await allQuery(`
      SELECT * FROM import_tasks ORDER BY created_at DESC LIMIT ? OFFSET ?
    `, [parseInt(pageSize), offset]);

    const countResult = await getQuery('SELECT COUNT(*) as total FROM import_tasks');

    res.json({
      success: true,
      data: {
        list: tasks,
        total: countResult.total,
        page: parseInt(page),
        pageSize: parseInt(pageSize)
      }
    });
  } catch (error) {
    console.error('查询导入任务错误:', error);
    res.status(500).json({ success: false, error: '查询失败' });
  }
});

router.get('/template', (req, res) => {
  try {
    const templateData = [
      {
        '档案标题': '关于XXXX的报告',
        '档案类别': '文书档案',
        '保管期限': '30年',
        '档案描述': '这是一份示例档案',
        '创建人': '张三',
        '创建日期': '2024-01-15',
        '所属部门': '办公室',
        '关键词': '报告,总结'
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '档案数据');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=档案导入模板.xlsx');
    res.send(buffer);
  } catch (error) {
    console.error('生成模板错误:', error);
    res.status(500).json({ success: false, error: '生成模板失败' });
  }
});

module.exports = router;
