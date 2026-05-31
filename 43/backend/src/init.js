const bcrypt = require('bcryptjs');
const { User, Role, Chemical, Permission } = require('./models/base');

async function initDatabase() {
  try {
    console.log('开始同步数据库表结构...');
    console.log('基础数据库表结构同步完成');
    console.log('流转数据库表结构同步完成');

    console.log('开始插入初始化数据...');

    const existingRoles = await Role.findAll();
    if (existingRoles.length > 0) {
      console.log('数据库已初始化，跳过数据插入');
      return true;
    }

    const allPermissions = [
      { permissionName: '申请单创建', permissionCode: 'apply:create', module: '申请管理', description: '创建危化品申领单' },
      { permissionName: '申请单查看', permissionCode: 'apply:view', module: '申请管理', description: '查看危化品申领单' },
      { permissionName: '申请单审批', permissionCode: 'approval:do', module: '审批管理', description: '审批危化品申领单' },
      { permissionName: '台账查看', permissionCode: 'ledger:view', module: '台账管理', description: '查看危化品台账' },
      { permissionName: '库存查看', permissionCode: 'inventory:view', module: '库存管理', description: '查看危化品库存' },
      { permissionName: '库存编辑', permissionCode: 'inventory:edit', module: '库存管理', description: '编辑库存预警阈值' },
      { permissionName: '用户管理', permissionCode: 'user:manage', module: '系统管理', description: '管理系统用户' },
      { permissionName: '角色管理', permissionCode: 'role:manage', module: '系统管理', description: '管理系统角色' }
    ];

    const permissions = await Permission.bulkCreate(allPermissions);
    console.log('默认权限插入完成');

    const roles = await Role.bulkCreate([
      {
        roleName: '系统管理员',
        roleCode: 'admin',
        description: '系统管理员，拥有所有权限',
        permissions: ['apply:create', 'apply:view', 'approval:do', 'ledger:view', 'inventory:view', 'inventory:edit', 'user:manage', 'role:manage']
      },
      {
        roleName: '审批人员',
        roleCode: 'approver',
        description: '审批人员，负责危化品申请审批',
        permissions: ['apply:view', 'approval:do', 'ledger:view', 'inventory:view']
      },
      {
        roleName: '普通用户',
        roleCode: 'user',
        description: '普通用户，可申请危化品',
        permissions: ['apply:create', 'apply:view']
      },
      {
        roleName: '仓库管理员',
        roleCode: 'warehouse',
        description: '仓库管理员，负责危化品出入库',
        permissions: ['apply:view', 'ledger:view', 'inventory:view', 'inventory:edit']
      },
      {
        roleName: '安全员',
        roleCode: 'safety',
        description: '安全员，负责安全监督检查',
        permissions: ['apply:view', 'ledger:view', 'approval:do', 'inventory:view']
      }
    ]);
    console.log('默认角色插入完成');

    const hashedPassword = await bcrypt.hash('123456', 10);

    const adminRole = roles.find(r => r.roleCode === 'admin');
    const userRole = roles.find(r => r.roleCode === 'user');
    const approverRole = roles.find(r => r.roleCode === 'approver');
    const warehouseRole = roles.find(r => r.roleCode === 'warehouse');
    const safetyRole = roles.find(r => r.roleCode === 'safety');

    await User.bulkCreate([
      {
        username: 'admin',
        password: hashedPassword,
        realName: '系统管理员',
        phone: '13800000001',
        department: '信息中心',
        roleId: adminRole.id,
        status: 1
      },
      {
        username: 'user',
        password: hashedPassword,
        realName: '普通用户',
        phone: '13800000002',
        department: '研发部',
        roleId: userRole.id,
        status: 1
      },
      {
        username: 'approver',
        password: hashedPassword,
        realName: '审批人员',
        phone: '13800000003',
        department: '安全管理部',
        roleId: approverRole.id,
        status: 1
      },
      {
        username: 'warehouse',
        password: hashedPassword,
        realName: '仓库管理员',
        phone: '13800000004',
        department: '仓储部',
        roleId: warehouseRole.id,
        status: 1
      },
      {
        username: 'safety',
        password: hashedPassword,
        realName: '安全员',
        phone: '13800000005',
        department: '安全管理部',
        roleId: safetyRole.id,
        status: 1
      }
    ]);
    console.log('默认用户插入完成');

    await Chemical.bulkCreate([
      {
        chemicalName: '浓硫酸',
        casNo: '7664-93-9',
        specification: '98%',
        unit: '瓶',
        stock: 100,
        dangerLevel: '腐蚀',
        storageCondition: '储存于阴凉、干燥、通风良好的专用库房',
        description: '化学式H₂SO₄，具有强腐蚀性、强氧化性，是重要的工业原料'
      },
      {
        chemicalName: '浓盐酸',
        casNo: '7647-01-0',
        specification: '36-38%',
        unit: '瓶',
        stock: 150,
        dangerLevel: '腐蚀',
        storageCondition: '储存于阴凉、通风的库房，与碱类、胺类、碱金属分开存放',
        description: '化学式HCl，具有强腐蚀性，有刺激性气味'
      },
      {
        chemicalName: '乙醇',
        casNo: '64-17-5',
        specification: '95%',
        unit: '桶',
        stock: 200,
        dangerLevel: '易燃',
        storageCondition: '储存于阴凉、通风的库房，远离火种、热源',
        description: '化学式C₂H₅OH，易燃，易挥发，常用作溶剂和消毒剂'
      },
      {
        chemicalName: '丙酮',
        casNo: '67-64-1',
        specification: '分析纯',
        unit: '桶',
        stock: 80,
        dangerLevel: '易燃',
        storageCondition: '储存于阴凉、通风良好的专用库房，远离火种、热源',
        description: '化学式CH₃COCH₃，易燃、易挥发，常用作有机溶剂'
      },
      {
        chemicalName: '甲苯',
        casNo: '108-88-3',
        specification: '分析纯',
        unit: '桶',
        stock: 60,
        dangerLevel: '易燃',
        storageCondition: '储存于阴凉、通风的库房，远离火种、热源，库温不宜超过30℃',
        description: '化学式C₆H₅CH₃，易燃，对人体有害，属易制毒化学品'
      },
      {
        chemicalName: '高锰酸钾',
        casNo: '7722-64-7',
        specification: '分析纯',
        unit: '瓶',
        stock: 120,
        dangerLevel: '易爆',
        storageCondition: '储存于阴凉、通风的库房，远离火种、热源，与还原剂、活性金属粉末等分开存放',
        description: '化学式KMnO₄，强氧化剂，与有机物接触易燃烧爆炸'
      },
      {
        chemicalName: '硝酸铵',
        casNo: '6484-52-2',
        specification: '工业级',
        unit: '袋',
        stock: 50,
        dangerLevel: '易爆',
        storageCondition: '储存于阴凉、干燥、通风良好的专用库房，远离火种、热源',
        description: '化学式NH₄NO₃，强氧化剂，受猛烈撞击或受热爆炸性分解'
      },
      {
        chemicalName: '氢气',
        casNo: '1333-74-0',
        specification: '99.9%',
        unit: '瓶',
        stock: 30,
        dangerLevel: '易燃',
        storageCondition: '储存于阴凉、通风的易燃气体专用库房，远离火种、热源，库温不宜超过30℃',
        description: '化学式H₂，易燃气体，与空气混合能形成爆炸性混合物'
      }
    ]);
    console.log('默认危化品数据插入完成');

    console.log('数据库初始化完成！');
    return true;
  } catch (error) {
    console.error('数据库初始化失败:', error);
    throw error;
  }
}

if (require.main === module) {
  initDatabase()
    .then(() => {
      console.log('初始化成功，退出程序');
      process.exit(0);
    })
    .catch((error) => {
      console.error('初始化失败:', error);
      process.exit(1);
    });
}

module.exports = { initDatabase };
