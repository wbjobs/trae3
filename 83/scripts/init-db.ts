import bcrypt from 'bcryptjs';
import { initAllSchemas } from '../api/db/schema.js';
import { getMetadataDb, generateUUID } from '../api/db/index.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const dataDir = path.join(__dirname, '../data');
const storageDir = path.join(__dirname, '../storage/attachments');
const thumbnailDir = path.join(__dirname, '../storage/thumbnails');

function ensureDirectories(): void {
  [dataDir, storageDir, thumbnailDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
}

function initAdminUser(): void {
  const db = getMetadataDb();
  
  const existingAdmin = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
  
  if (!existingAdmin) {
    const passwordHash = bcrypt.hashSync('admin123', 10);
    const userId = generateUUID();
    
    db.prepare(`
      INSERT INTO users (id, username, email, password_hash, role, is_active)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(userId, 'admin', 'admin@rubbing-system.com', passwordHash, 'admin', 1);
    
    console.log('管理员账号创建成功: admin / admin123');
  } else {
    console.log('管理员账号已存在');
  }
}

function initMockUsers(): void {
  const db = getMetadataDb();
  
  const mockUsers = [
    { username: 'operator1', email: 'operator1@rubbing-system.com', role: 'operator', password: 'operator123' },
    { username: 'auditor1', email: 'auditor1@rubbing-system.com', role: 'auditor', password: 'auditor123' },
    { username: 'viewer1', email: 'viewer1@rubbing-system.com', role: 'viewer', password: 'viewer123' },
  ];
  
  const insertStmt = db.prepare(`
    INSERT INTO users (id, username, email, password_hash, role, is_active)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  
  const checkStmt = db.prepare('SELECT id FROM users WHERE username = ?');
  
  mockUsers.forEach(user => {
    const existing = checkStmt.get(user.username);
    if (!existing) {
      const passwordHash = bcrypt.hashSync(user.password, 10);
      insertStmt.run(generateUUID(), user.username, user.email, passwordHash, user.role, 1);
      console.log(`测试用户创建成功: ${user.username} / ${user.password}`);
    }
  });
}

function initMockRubbings(): void {
  const db = getMetadataDb();
  
  const count = db.prepare('SELECT COUNT(*) as cnt FROM rubbings').get() as { cnt: number };
  
  if (count.cnt > 0) {
    console.log('拓片数据已存在，跳过初始化');
    return;
  }
  
  const adminUser = db.prepare('SELECT id FROM users WHERE username = ?').get('admin') as { id: string };
  
  const mockRubbings = [
    {
      accessionNo: 'TP-2024-0001',
      title: '颜真卿多宝塔碑拓片',
      dynasty: '唐代',
      era: '天宝十一年',
      author: '颜真卿',
      calligrapher: '颜真卿',
      material: '纸本',
      width: 102.5,
      height: 205.3,
      dimension_unit: 'cm',
      rubbing_date: '1985-06-15',
      rubbing_method: '乌金拓',
      collector: '故宫博物院',
      collection_no: '故00123456',
      description: '《多宝塔碑》是唐代书法家颜真卿的代表作之一，天宝十一年（752年）刻于陕西兴平县千福寺。此拓片为现代精拓，墨色均匀，字迹清晰。',
      inscription: '大唐西京千福寺多宝佛塔感应碑文。南阳岑勋撰。京兆颜真卿书。朝散郎检校尚书都官郎中东海徐浩题额。',
      keywords: ['唐代', '颜真卿', '楷书', '多宝塔碑', '乌金拓'],
      status: 'published',
    },
    {
      accessionNo: 'TP-2024-0002',
      title: '柳公权玄秘塔碑拓片',
      dynasty: '唐代',
      era: '会昌元年',
      author: '柳公权',
      calligrapher: '柳公权',
      material: '纸本',
      width: 98.0,
      height: 230.0,
      dimension_unit: 'cm',
      rubbing_date: '1978-03-20',
      rubbing_method: '蝉翼拓',
      collector: '上海博物馆',
      collection_no: '上博008765',
      description: '《玄秘塔碑》是柳公权楷书代表作，会昌元年（841年）立。此拓本为晚清旧拓，保存完好，字迹神完气足。',
      inscription: '唐故左街僧录内供奉三教谈论引驾大德安国寺上座赐紫大达法师玄秘塔碑铭并序。',
      keywords: ['唐代', '柳公权', '楷书', '玄秘塔碑', '蝉翼拓'],
      status: 'published',
    },
    {
      accessionNo: 'TP-2024-0003',
      title: '王羲之兰亭序摹本拓片',
      dynasty: '东晋',
      era: '永和九年',
      author: '王羲之',
      calligrapher: '冯承素',
      material: '纸本',
      width: 28.5,
      height: 68.0,
      dimension_unit: 'cm',
      rubbing_date: '1990-11-05',
      rubbing_method: '朱拓',
      collector: '私人收藏',
      collection_no: 'PRC-0001',
      description: '《兰亭序》被誉为"天下第一行书"，此为冯承素摹本的拓本，双钩填墨，精妙传神。',
      inscription: '永和九年，岁在癸丑，暮春之初，会于会稽山阴之兰亭，修禊事也。',
      keywords: ['东晋', '王羲之', '行书', '兰亭序', '朱拓'],
      status: 'pending',
    },
    {
      accessionNo: 'TP-2024-0004',
      title: '欧阳询九成宫醴泉铭拓片',
      dynasty: '唐代',
      era: '贞观六年',
      author: '欧阳询',
      calligrapher: '欧阳询',
      material: '纸本',
      width: 93.0,
      height: 190.0,
      dimension_unit: 'cm',
      rubbing_date: '1965-08-12',
      rubbing_method: '乌金拓',
      collector: '国家图书馆',
      collection_no: '国图002345',
      description: '《九成宫醴泉铭》是欧阳询楷书巅峰之作，贞观六年（632年）刻于陕西麟游。此拓本为明代早期拓本，极为珍贵。',
      inscription: '秘书监检校侍中钜鹿郡公臣魏徵奉敕撰。太子率更令弘文馆学士渤海男欧阳询奉敕书。',
      keywords: ['唐代', '欧阳询', '楷书', '九成宫', '明拓本'],
      status: 'published',
    },
    {
      accessionNo: 'TP-2024-0005',
      title: '张猛龙碑拓片',
      dynasty: '北魏',
      era: '正光三年',
      author: '佚名',
      calligrapher: '佚名',
      material: '纸本',
      width: 88.0,
      height: 210.0,
      dimension_unit: 'cm',
      rubbing_date: '1956-04-18',
      rubbing_method: '墨拓',
      collector: '故宫博物院',
      collection_no: '故00654321',
      description: '《张猛龙碑》为北魏著名碑刻，正光三年（522年）立，被誉为"魏碑第一"。此拓本为清乾隆年间拓本。',
      inscription: '魏鲁郡太守张府君清颂之碑。',
      keywords: ['北魏', '魏碑', '张猛龙碑', '楷书', '清拓本'],
      status: 'draft',
    },
  ];
  
  const insertRubbingStmt = db.prepare(`
    INSERT INTO rubbings (
      id, accession_no, title, dynasty, era, author, calligrapher, material,
      width, height, dimension_unit, rubbing_date, rubbing_method,
      collector, collection_no, description, inscription, keywords, status, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  const insertFileStmt = db.prepare(`
    INSERT INTO files (
      id, rubbing_id, original_name, file_name, file_size, mime_type,
      width, height, dpi, color_space, checksum, storage_path, storage_bucket, is_primary
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  mockRubbings.forEach((rubbing, index) => {
    const rubbingId = generateUUID();
    
    insertRubbingStmt.run(
      rubbingId,
      rubbing.accessionNo,
      rubbing.title,
      rubbing.dynasty,
      rubbing.era,
      rubbing.author,
      rubbing.calligrapher,
      rubbing.material,
      rubbing.width,
      rubbing.height,
      rubbing.dimension_unit,
      rubbing.rubbing_date,
      rubbing.rubbing_method,
      rubbing.collector,
      rubbing.collection_no,
      rubbing.description,
      rubbing.inscription,
      JSON.stringify(rubbing.keywords),
      rubbing.status,
      adminUser.id
    );
    
    const fileId = generateUUID();
    insertFileStmt.run(
      fileId,
      rubbingId,
      `${rubbing.accessionNo}_${rubbing.title}.tif`,
      `${fileId}.tif`,
      Math.floor(Math.random() * 2000000000) + 500000000,
      'image/tiff',
      Math.floor(rubbing.width * 10),
      Math.floor(rubbing.height * 10),
      300,
      'RGB',
      generateUUID(),
      `/attachments/${fileId}.tif`,
      'rubbings',
      1
    );
    
    console.log(`创建拓片记录: ${rubbing.title}`);
  });
}

async function main(): Promise<void> {
  console.log('开始初始化数据库...');
  
  ensureDirectories();
  
  initAllSchemas();
  
  initAdminUser();
  
  initMockUsers();
  
  initMockRubbings();
  
  console.log('数据库初始化完成！');
  console.log('');
  console.log('默认账号:');
  console.log('  管理员: admin / admin123');
  console.log('  录入员: operator1 / operator123');
  console.log('  审核员: auditor1 / auditor123');
  console.log('  检索用户: viewer1 / viewer123');
}

main().catch(err => {
  console.error('数据库初始化失败:', err);
  process.exit(1);
});
