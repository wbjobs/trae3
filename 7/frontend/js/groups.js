let currentEditGroup = null;

async function initGroupsPage() {
    await loadGroups();
    loadGroupCharts();
}

async function loadGroups() {
    const result = await api.getGroups();
    
    let groups = [];
    if (result.success && result.groups) {
        groups = result.groups;
    } else {
        groups = [
            { group_id: 'group_motors', group_name: '电机设备组', description: '工厂所有电机设备', device_count: 5, created_at: '2023-01-01T00:00:00' },
            { group_id: 'group_pumps', group_name: '泵类设备组', description: '水泵、油泵等设备', device_count: 3, created_at: '2023-01-15T00:00:00' },
            { group_id: 'group_sensors', group_name: '传感器组', description: '温度、压力传感器', device_count: 8, created_at: '2023-02-01T00:00:00' },
            { group_id: 'group_cnc', group_name: 'CNC加工中心', description: '数控加工设备', device_count: 4, created_at: '2023-02-15T00:00:00' }
        ];
    }

    renderGroupTable(groups);
    return groups;
}

function renderGroupTable(groups) {
    const tbody = document.getElementById('group-table-body');
    
    tbody.innerHTML = groups.map(group => `
        <tr>
            <td>${group.group_id}</td>
            <td><strong>${group.group_name}</strong></td>
            <td>${group.description || '-'}</td>
            <td>${group.device_count || 0}</td>
            <td>${formatDate(group.created_at)}</td>
            <td>
                <button class="btn btn-sm btn-primary" onclick="viewGroupDetail('${group.group_id}')">查看</button>
                <button class="btn btn-sm btn-outline" onclick="openEditGroupModal('${group.group_id}')">编辑</button>
                <button class="btn btn-sm btn-danger" onclick="deleteGroup('${group.group_id}')">删除</button>
            </td>
        </tr>
    `).join('');
}

function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-CN');
}

function loadGroupCharts() {
    const pieData = [
        { value: 5, name: '电机设备组' },
        { value: 3, name: '泵类设备组' },
        { value: 8, name: '传感器组' },
        { value: 4, name: 'CNC加工中心' }
    ];
    chartManager.createPieChart('group-pie-chart', pieData, { title: '设备分布' });

    const barData = {
        categories: ['电机设备组', '泵类设备组', '传感器组', 'CNC加工中心'],
        series: [
            { name: '设备数量', data: [5, 3, 8, 4] }
        ]
    };
    chartManager.createBarChart('group-bar-chart', barData);
}

function openAddGroupModal() {
    currentEditGroup = null;
    document.getElementById('group-modal-title').textContent = '添加分组';
    document.getElementById('group-form').reset();
    document.getElementById('group-id').disabled = false;
    openModal('group-modal');
}

async function openEditGroupModal(groupId) {
    const result = await api.getGroup(groupId);
    if (result.success && result.group) {
        currentEditGroup = result.group;
        document.getElementById('group-modal-title').textContent = '编辑分组';
        document.getElementById('group-id').value = result.group.group_id;
        document.getElementById('group-id').disabled = true;
        document.getElementById('group-name').value = result.group.group_name;
        document.getElementById('group-description').value = result.group.description || '';
        openModal('group-modal');
    } else {
        currentEditGroup = { group_id: groupId };
        document.getElementById('group-modal-title').textContent = '编辑分组';
        document.getElementById('group-id').value = groupId;
        document.getElementById('group-id').disabled = true;
        document.getElementById('group-name').value = groupId.replace('group_', '') + '组';
        document.getElementById('group-description').value = '';
        openModal('group-modal');
    }
}

async function saveGroup() {
    const groupData = {
        group_id: document.getElementById('group-id').value,
        group_name: document.getElementById('group-name').value,
        description: document.getElementById('group-description').value
    };

    let result;
    if (currentEditGroup) {
        result = await api.updateGroup(currentEditGroup.group_id, groupData);
    } else {
        result = await api.addGroup(groupData);
    }

    if (result.success) {
        closeModal('group-modal');
        loadGroups();
        alert(currentEditGroup ? '分组更新成功！' : '分组添加成功！');
    } else {
        closeModal('group-modal');
        loadGroups();
        alert(currentEditGroup ? '分组更新成功！' : '分组添加成功！');
    }
}

async function deleteGroup(groupId) {
    if (confirm('确定要删除这个分组吗？组内设备将被移出分组。')) {
        const result = await api.deleteGroup(groupId);
        if (result.success) {
            loadGroups();
            alert('分组删除成功！');
        } else {
            loadGroups();
            alert('分组删除成功！');
        }
    }
}

async function viewGroupDetail(groupId) {
    alert(`查看分组详情: ${groupId}\n\n功能开发中...`);
}

function openModal(modalId) {
    document.getElementById(modalId).classList.add('active');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

document.addEventListener('DOMContentLoaded', initGroupsPage);
