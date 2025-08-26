export const appRoutesPrefix = '/api/v1'
export const userRoutePrefix = '/user'
export const debateRoutePrefix = '/debate'

export enum debateRoutes {
  GetAllDebates = '/all-debates',
  GetSingleDebate = '/single-debate',
  GetNewDebate = '/new-debate',
  GetResults = '/:expId/results',
}

export enum userRoutes {
  GetUserAuth = '/user-auth',
}
