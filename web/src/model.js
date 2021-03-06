const originalClientField = {
  _id: {},
  userId: {},
  teamName: {},
  teamMembers: {},
  driveFolderId: {},
  planId: {},
  created: {},
  updated: {},
}

const clientField = {
  _id: {},
  firstName: {},
  lastName: {},
  teamName: {},
  teamMembers: {},
  email: {},
  avatar: {},
  phone: {},
  password: {},
  status: {},
  // Rich information
  numOfUsers: {},
  numOfUsersOnline: {},
  numOfShows: {},
  driveUsed: {},
  // timestamp
  created: {},
  updated: {},
}

const clientRegisterFields = {
  _id: {},
  userId: {},
  teamName: {},
  driveFolderId: {},
  planId: {},
  created: {},
  updated: {},
}

const userField = {
  _id: {},
  firstName: {},
  lastName: {},
  avatar: {},
  phone: {},
  email: {},
  password: {},
  roles: {},
  status: {},
  created: {},
  updated: {},
}

export const models = {
  user: userField,
  client: clientField,
  newClient: clientRegisterFields,
  originalClient: originalClientField,
  user_role: {
    _id: {},
    roleId: {},
    userId: {},
  },
  role: {
    _id: {},
    name: {},
    created: {},
  },
  token: {
    _id: {},
    token: {},
    userId: {},
    created: {},
    user: userField,
    client: clientRegisterFields
  },
}