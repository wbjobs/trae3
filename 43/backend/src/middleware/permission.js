function requirePermission(permissionCode) {
  return function(req, res, next) {
    if (!req.user) {
      return res.status(401).json({ code: 401, message: '未登录，请先登录' });
    }

    const permissions = req.user.permissions || [];
    
    if (!permissions.includes(permissionCode)) {
      return res.status(403).json({ code: 403, message: '无权限执行此操作' });
    }

    next();
  };
}

function requireRole(roleCodes) {
  return function(req, res, next) {
    if (!req.user) {
      return res.status(401).json({ code: 401, message: '未登录，请先登录' });
    }

    if (!roleCodes.includes(req.user.roleCode)) {
      return res.status(403).json({ code: 403, message: '无权限执行此操作' });
    }

    next();
  };
}

module.exports = {
  requirePermission,
  requireRole
};
