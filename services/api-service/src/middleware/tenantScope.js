const { AuthError, ForbiddenError } = require('../utils/errors');

function tenantMatches(userTenantId, resourceTenantId) {
  return String(userTenantId) === String(resourceTenantId);
}

function assertTenantAccess(req, resourceTenantId) {
  if (!req.user) {
    throw new AuthError('Authentication required');
  }

  if (!resourceTenantId) {
    throw new ForbiddenError('Resource tenant could not be determined');
  }

  if (!tenantMatches(req.user.tenant, resourceTenantId)) {
    throw new ForbiddenError('Access denied for this tenant');
  }
}

function withTenantScope(user, filter = {}) {
  if (!user?.tenant) {
    throw new AuthError('Authentication required');
  }

  return {
    ...filter,
    tenant: user.tenant,
  };
}

function requireTenantAccess(getResourceTenantId) {
  return async (req, res, next) => {
    try {
      const resourceTenantId = await getResourceTenantId(req);
      assertTenantAccess(req, resourceTenantId);
      return next();
    } catch (error) {
      if (error instanceof AuthError || error instanceof ForbiddenError) {
        return res.status(error.statusCode).json({
          error: {
            code: error.code,
            message: error.message,
          },
        });
      }

      return next(error);
    }
  };
}

module.exports = {
  tenantMatches,
  assertTenantAccess,
  withTenantScope,
  requireTenantAccess,
};
