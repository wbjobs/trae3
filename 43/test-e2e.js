const http = require('http');

function request(method, path, token = null, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3003,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };
    if (token) {
      options.headers['Authorization'] = 'Bearer ' + token;
    }
    
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve({ raw: data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function test() {
  console.log('=== 端到端测试开始 ===\n');
  
  try {
    console.log('1. 用户登录...');
    const loginResp = await request('POST', '/api/auth/login', null, {
      username: 'user',
      password: '123456'
    });
    const userToken = loginResp.data.token;
    console.log('   登录成功，用户ID:', loginResp.data.user.id);
    
    console.log('\n2. 创建新申请...');
    const createResp = await request('POST', '/api/applications', userToken, {
      chemicalId: 2,
      quantity: 3,
      purpose: '实验室分析测试',
      usageLocation: 'A栋201室',
      emergencyContact: '李四',
      emergencyPhone: '13900000000'
    });
    console.log('   申请ID:', createResp.data.id);
    console.log('   申请单号:', createResp.data.applyNo);
    console.log('   当前状态:', createResp.data.status);
    console.log('   当前步骤:', createResp.data.currentStep);
    const appId = createResp.data.id;
    
    console.log('\n3. 提交申请...');
    const submitResp = await request('PUT', `/api/applications/${appId}/submit`, userToken);
    console.log('   提交后状态:', submitResp.data.status);
    console.log('   提交后步骤:', submitResp.data.currentStep);
    
    console.log('\n4. 部门负责人登录...');
    const deptLoginResp = await request('POST', '/api/auth/login', null, {
      username: 'dept',
      password: '123456'
    });
    const deptToken = deptLoginResp.data.token;
    console.log('   登录成功');
    
    console.log('\n5. 部门负责人审批...');
    const approveResp = await request('PUT', `/api/approvals/${appId}/approve`, deptToken, {
      remark: '情况属实，同意申请'
    });
    console.log('   审批后状态:', approveResp.data.status);
    console.log('   审批后步骤:', approveResp.data.currentStep);
    
    console.log('\n6. 查询溯源日志...');
    const traceResp = await request('GET', `/api/traces/application/${appId}`, userToken);
    console.log('   溯源记录数:', traceResp.data.length);
    traceResp.data.forEach((log, i) => {
      console.log(`   ${i+1}. ${log.action} - ${log.operatorName} - ${new Date(log.createdAt).toLocaleString()}`);
    });
    
    console.log('\n=== 测试成功完成！===');
    
  } catch (err) {
    console.error('\n测试失败:', err.message);
  }
}

test();
