import Model from './index'
import DateTime from '../types/datetime'
import {
  GraphQLID,
  GraphQLString,
  GraphQLList,
  GraphQLObjectType,
  GraphQLNonNull,
  GraphQLBoolean,
  GraphQLInt
} from 'graphql'
import cheerio from 'cheerio'
import googleApi from '../google/googleapi'
import _ from 'lodash'
import { Map } from 'immutable'
import Email from '../types/email'

export default class Document extends Model {

  constructor (ctx) {
    super('document', 'document', ctx)
    this.shareDriveFolder = this.shareDriveFolder.bind(this)

    this.sharedDriveUsers = new Map()
  }

  /**
   * Share folder of google drive to owner and assignee
   * @param model
   * @param fileId
   * @returns {Promise<void>}
   */
  async shareDriveFolder (model, fileId) {

    if (!model._id || !fileId) {
      return
    }

    const body = _.get(model, 'body')
    const $ = cheerio.load(body)

    const id = model._id

    const modelIdString = _.toString(id)
    let assignedUserIds = [_.toString(_.get(model, 'userId'))]

    $('.livex-quill-gfx').map(async (index, el) => {
      const content = $(el).attr('data-content')

      if (!content) {
        return
      }

      let gfx

      try {
        const payload = JSON.parse(content)
        gfx = _.get(payload, 'payload', null)

      }
      catch (e) {

      }
      if (gfx) {
        const assignUserId = _.get(gfx, 'assign._id')
        assignedUserIds.push(assignUserId)

      }

      return null
    })

    assignedUserIds = _.uniq(assignedUserIds)
    if (!assignedUserIds.length) {
      return
    }
    for (let i = 0; i < assignedUserIds.length; i++) {

      const uid = assignedUserIds[i]

      const key = `${modelIdString}-${uid}`
      if (!this.sharedDriveUsers.get(key)) {

        const user = await  this.database.models().user.get(uid)

        await googleApi.createPermission(fileId, {
            'type': 'user',
            'role': 'writer',
            'emailAddress': user.email,
          },
        )

        // Share with people have link
        await googleApi.createPermission(fileId, {
            'type': 'anyone',
            'role': 'reader',
          },
        )

      }
      this.sharedDriveUsers = this.sharedDriveUsers.set(key, uid)

    }

  }

  /**
   * Implements Hook afterSave(id, model)
   * @param id
   * @param model
   * @returns {Promise<any>}
   */
  async afterSave (id, model) {

    const modelId = _.toString(_.get(model, '_id'))
    const name = _.get(model, 'title', modelId)
    const drivePromise = googleApi.createDocumentFolder(name ? name : modelId,
      {documentId: modelId})

    return new Promise((resolve, reject) => {

      if (!id) {
        // if first time we do create a folder and wait for complete
        drivePromise.then((file) => {

          const fileId = _.get(file, 'id')
          model.driveId = fileId

          //@todo for now let temporary give all user at tpvhub.net company has permission to read/write files in document folder
          googleApi.createPermission(fileId, {
              'type': 'user',
              'role': 'writer',
              'emailAddress': 'pvtinh1996@gmail.com'
            },
          ).catch((e) => {
            console.log('error grant permission to drive folder.', e)
          })

          // shared with owner

          return resolve(model)
        }).catch((e) => {
          console.log('An error create folder', e)
          return resolve(model)

        })

      } else {
        // update drive id and save in silent
        drivePromise.then((file) => {

          this.shareDriveFolder(model, file.id).catch((e) => {
            console.log('Share permission error', e)
          })

          model.driveId = _.get(file, 'id')

          this.save(id, model, true).catch((e) => {
            console.log('An error save model after check drive folder.', e)
          })

        })

        return resolve(model)
      }

    })
  }

  /**
   * Share document to Email
   * @param id
   * @param email
   * @param accessType
   */
  async shareDocumentToEmail (id, email, accessType = 'read') {

    const User = this.database.models().user

    const user = User.findOne({email: _.toLower(email)})
    if (user) {
      return this.shareDocumentToUser(id, user._id, accessType)
    } else {
      //@todo create an invitation and we do need notify to client to create an account and access the document
      return 'Need implement'
    }

  }

  /**
   * Share document to userId
   * @param id
   * @param userId
   * @param accessType
   */
  async shareDocumentToUser (id, userId, accessType = null) {

    const User = this.database.models().user
    const user = await User.get(userId)
    const document = await this.get(id)

    return new Promise((resolve, reject) => {

      if (!document) {
        return reject('Document found.')
      }
      if (!user) {
        return reject('User not found.')
      }

      // let remove

      // let remove in cache
      this.cache_remove(id)
      if (accessType === 'write') {
        this.getCollection().updateOne(
          {_id: document._id},
          {
            $pull: {readPermissions: user._id},
            $addToSet: {writePermissions: user._id},
          },
          (err, result) => {
            if (err) {
              return reject(err)
            }

            return resolve({
              firstName: _.get(user, 'firstName', ''),
              lastName: _.get(user, 'lastName'),
              email: null,
              type: 'write',
              userId: userId,
              documentId: id,
            })

          },
        )
      }
      else if (accessType === 'read') {
        this.getCollection().updateOne(
          {_id: document._id},
          {
            $pull: {writePermissions: user._id},
            $addToSet: {readPermissions: user._id},
          },
          (err, result) => {
            if (err) {
              return reject(err)
            }

            return resolve({
              firstName: _.get(user, 'firstName', ''),
              lastName: _.get(user, 'lastName'),
              email: null,
              type: 'read',
              userId: userId,
              documentId: id,
            })
          },
        )
      }
      else {

        // let remove read & write permission
        this.getCollection().updateOne(
          {_id: document._id},
          {
            $pull: {writePermissions: user._id, readPermissions: user._id},
          },
          (err, result) => {
            return err ? reject(err) : resolve({
              firstName: null,
              lastName: null,
              email: null,
              type: null,
              userId: userId,
              documentId: id,
            })
          },
        )
      }

    })

  }

  /**
   * List document permissions
   * @param id
   * @returns {Promise<*>}
   */
  async getDocumentPermissions (id) {

    if (!id) {
      return Promise.reject('Id is required')
    }
    const model = await this.get(id)

    return new Promise(async (resolve, reject) => {
      if (!model) {
        return reject('Document not found.')
      }

      let list = []
      const read = _.get(model, 'readPermissions', [])
      const write = _.get(model, 'writePermissions', [])

      for (let i = 0; i < read.length; i++) {
        const userId = read[i]
        const user = await this.database.models().user.get(userId)
        list.push({
          type: 'read',
          userId: userId,
          documentId: id,
          user: {
            _id: _.get(user, '_id'),
            firstName: _.get(user, 'firstName', null),
            lastName: _.get(user, 'lastName', null),
            avatar: _.get(user, 'avatar', null),
          },
        })
      }
      for (let i = 0; i < write.length; i++) {
        const userId = write[i]
        const user = await this.database.models().user.get(userId)
        list.push({
          type: 'write',
          userId: userId,
          documentId: id,
          user: user ? {
            _id: _.get(user, '_id'),
            firstName: _.get(user, 'firstName', null),
            lastName: _.get(user, 'lastName', null),
            avatar: _.get(user, 'avatar', null),
          } : null,
        })
      }

      return resolve(list)

    })

  }

  /**
   * Check document acccess
   * @param id
   * @param userId
   * @returns {Promise<any>}
   */
  async checkDocumentAccess (id, userId) {

    return new Promise(async (resolve, reject) => {
      if (!id) {
        return reject('Document not found.')
      }
      if (!userId) {
        return resolve({
          read: false,
          write: false
        })
      }

      const roles = await this.database.models().user.getUserRoles(userId)
      // all staff or administrator has permission to read/write any document
      if (_.includes(roles, 'administrator') || _.includes(roles, 'staff')) {
        return resolve({
          read: true,
          write: true
        })
      }

      const model = await this.get(id)

      let access = {
        read: false,
        write: false
      }

      _.each(_.get(model, 'writePermissions', []), (uid) => {
        if (_.toString(uid) === _.toString(userId)) {
          access.write = true
          access.read = true
        }
      })
      if (access.read === false) {
        _.each(_.get(model, 'readPermissions', []), (uid) => {
          if (_.toString(uid) === _.toString(userId)) {
            access.read = true
          }
        })
      }

      return resolve(access)

    })
  }

  /**
   * Override Mutation
   */
  mutation () {
    const parentMutation = super.mutation()

    const createDocumentPermissionType = new GraphQLObjectType({
      name: 'createDocumentPermission',
      fields: () => ({
        type: {
          type: GraphQLString,
        },
        documentId: {
          type: GraphQLID,
        },
        userId: {
          type: GraphQLID,
        },
        email: {
          type: Email,
        },
        firstName: {
          type: GraphQLString,
        },
        lastName: {
          type: GraphQLString,
        },
      }),
    })

    const mutation = {
      update_document: {
        type: this.schema('mutation'),
        args: this.fields(),

        resolve: async (value, args, request) => {
          const id = _.get(args, '_id')
          let originalModel = null
          let hasPerm = false
          try {
            hasPerm = await this.checkPermission(request, 'updateById', id)
            originalModel = await this.get(id)
          }
          catch (err) {

          }

          return new Promise(async (resolve, reject) => {

            if (!hasPerm) {
              const userId = _.get(request, 'token.userId')
              const checkPermReadWrite = await this.checkDocumentAccess(id, userId)
              if (!_.get(checkPermReadWrite, 'write')) {
                return reject('Access denied')
              }
            }
            if (!originalModel) {
              return reject('Document not found.')
            }
            let model = null
            let saveError = null
            try {

              args.writePermissions = _.get(originalModel, 'writePermissions',
                [])
              args.readPermissions = _.get(originalModel, 'readPermissions', [])

              model = await this.save(id, args)
            } catch (e) {
              saveError = e
            }

            if (saveError) {
              return reject(saveError)
            }
            let relations = []
            _.each(this.relations(), (v, k) => {
              if (v.type === 'belongTo') {
                relations.push({name: k, relation: v})
              }
            })
            for (let i in relations) {
              const relation = relations[i]
              const localField = _.get(relation, 'relation.localField')
              const relationId = _.get(model, localField)
              let relationModel = null
              try {
                relationModel = await relation.relation.model.get(relationId)
              } catch (e) {

              }
              model[relation.name] = relationModel
            }

            return resolve(model)

          })

        },
      },
      createDocumentPermission: {
        type: createDocumentPermissionType,
        args: {
          id: {
            name: 'id',
            type: GraphQLNonNull(GraphQLID),
          },
          type: {
            name: 'access_type',
            type: GraphQLString,
          },
          email: {
            name: 'email',
            type: Email,
          },
          userId: {
            name: 'userId',
            type: GraphQLID,
          },
        },
        resolve: async (value, args, request) => {

          const id = _.get(args, 'id')
          const email = _.get(args, 'email', null)
          const userId = _.get(args, 'userId', null)
          const accessType = _.get(args, 'type', null)

          let permission = false
          let permissionError = null

          try {
            permission = await this.checkPermission(request,
              'createDocumentPermission', id)
          }
          catch (e) {
            permissionError = e
          }

          return new Promise(async (resolve, reject) => {
            if (!id) {
              return reject('Document Id is required.')
            }
            if (!email && !userId) {
              return reject('Email or userId is required.')
            }

            if (!permission || permissionError !== null) {
              return reject('Access denied')
            }

            let result = null
            let error = null
            if (email) {
              try {
                result = await this.shareDocumentToEmail(id, email,
                  accessType)
              } catch (e) {
                error = e
              }
              return resolve(error ? reject(error) : resolve(result))
            } else {
              // we have userId
              try {
                result = await this.shareDocumentToUser(id, userId,
                  accessType)
              } catch (e) {
                error = e
              }
              return resolve(error ? reject(error) : resolve(result))
            }

          })
        },
      },

    }

    return Object.assign(parentMutation, mutation)
  }

  /**
   * Override query
   */
  query () {

    const _schema = this.schema('query')
    const parentQuery = super.query()

    const documentPermissionType = new GraphQLObjectType({
      name: 'getDocumentPermissions',
      fields: ({
        type: {type: GraphQLString},
        userId: {type: GraphQLID},
        documentId: {type: GraphQLID},
        user: {
          type: new GraphQLObjectType({
            name: 'documentPermissionUser',
            fields: ({
              _id: {type: GraphQLID},
              firstName: {type: GraphQLString},
              lastName: {type: GraphQLString},
              avatar: {type: GraphQLString},
            }),
          }),
        },
      }),
    })

    const query = {
      count_document: {
        type: GraphQLInt,
        args: {
          search: {
            type: GraphQLString,
            defaultValue: '',
          },
        },
        resolve: async (value, args, request) => {

          let findQuery = {}
          const search = _.toLower(_.trim(_.get(args, 'search', '')))
          const userId = _.get(request, 'token.userId')

          return new Promise(async (resolve, reject) => {

            if (!userId) {
              return reject('Access denied.')
            }
            const user = await this.database.models().user.get(userId)

            if (!user) {
              return reject('Access denied.')
            }

            let roles = _.get(user, 'roles', [])
            if (roles === null) {
              roles = []
            }

            if (_.includes(roles, 'administrator') || _.includes(roles, 'staff')) {
              // staff and administrator we allow get all documents
              findQuery = null
            } else {

              // let custom query
              findQuery = {
                $or: [
                  {
                    readPermissions: {$all: [userId]}
                  },
                  {
                    writePermissions: {$all: [userId]}
                  }
                ]
              }
            }

            if(search){
              findQuery = {$text: {$search: search}}
            }

            this.count(findQuery).then((num) => {
              return resolve(num)
            }).catch((err) => {
              return reject(err)
            })

          })

        },
      },
      document: {
        type: _schema,
        args: {
          id: {
            type: GraphQLID,
          },
          relations: {
            type: new GraphQLList(GraphQLString),
            defaultValue: [],
          },
        },
        resolve: async (value, args, request) => {
          const id = _.get(args, 'id', null)

          const hasPerm = await this.checkPermission(request, 'findById', id)

          return new Promise(async (resolve, reject) => {

            if (!hasPerm) {
              const userId = _.get(request, 'token.userId')
              if (!userId) {
                return reject('Access denied')
              }
              const checkReadWritePermission = await this.checkDocumentAccess(id, userId)
              if (!_.get(checkReadWritePermission, 'read') && !_.get(checkReadWritePermission, 'write')) {
                return reject('Access denied')
              }
            }

            let result = null
            let resultError = null
            try {
              result = await this.get(id)
            } catch (e) {
              resultError = e
            }

            if (resultError) {
              return reject(resultError)
            }

            const modelRelations = this.relations()
            const relations = _.get(args, 'relations')

            for (let i in relations) {
              const relationName = relations[i]

              const relationSettings = _.get(modelRelations, relationName)
              if (relationSettings) {
                if (relationSettings.type === 'belongTo') {
                  const localId = _.get(result, relationSettings.localField)

                  let relationResult = null
                  try {
                    relationResult = await relationSettings.model.get(localId)
                  } catch (e) {

                  }
                  result[relationName] = relationResult
                }

              }
            }

            return resolve(result)
          })

        },
      },
      documents: {

        type: new GraphQLList(_schema),
        args: {
          limit: {
            type: GraphQLInt,
            defaultValue: 50,
          },
          skip: {
            type: GraphQLInt,
            defaultValue: 0,
          },
          search: {
            type: GraphQLString,
            defaultValue: '',
          },
          relations: {
            type: new GraphQLList(GraphQLString),
            defaultValue: [],
          },

        },
        resolve: async (value, args, request) => {

          let findQuery = {}

          const userId = _.get(request, 'token.userId')
          const search = _.toLower(_.trim(_.get(args, 'search', '')))
          return new Promise(async (resolve, reject) => {

            if (!userId) {
              return reject('Access denied.')
            }
            const user = await this.database.models().user.get(userId)

            if (!user) {
              return reject('Access denied.')
            }

            let roles = _.get(user, 'roles', [])
            if (roles === null) {
              roles = []
            }

            if (_.includes(roles, 'administrator') || _.includes(roles, 'staff')) {
              // staff and administrator we allow get all documents
              findQuery = null
            } else {

              // let custom query
              findQuery = {
                $or: [
                  {
                    readPermissions: {$all: [userId]}
                  },
                  {
                    writePermissions: {$all: [userId]}
                  }
                ]
              }
            }

            if(search){
              findQuery = {$text: {$search: search}}
            }

            const filter = {
              limit: _.get(args, 'limit', 0),
              skip: _.get(args, 'skip', 0),
            }

            let findError = null
            let results = []
            const relations = _.get(args, 'relations')
            try {
              results = await this.find(findQuery, filter)
            } catch (e) {
              findError = e
            }

            if (findError) {
              return reject(findError)
            }

            const modelRelations = this.relations()

            for (let resultIndex in results) {
              for (let relationIndex in relations) {

                const relationName = relations[relationIndex]
                const relationSetting = _.get(modelRelations, relationName)
                if (relationSetting) {
                  let relationResult = null
                  const localId = _.get(results[resultIndex],
                    relationSetting.localField)

                  if (relationSetting.type === 'belongTo') {

                    try {
                      relationResult = await relationSetting.model.get(localId)
                    } catch (e) {

                    }
                    results[resultIndex][relationName] = relationResult
                  }
                  else if (relationSetting.type === 'hasMany') {
                    relationResult = []

                    try {
                      const findQuery = {
                        _id: localId,
                      }
                      relationResult = await relationSetting.model.find(
                        findQuery, {skip: 0, limit: 50})
                    } catch (e) {

                    }
                    results[resultIndex][relationName] = relationResult
                  }
                }
              }
            }

            return resolve(results)

          })

        },
      },
      getDocumentPermissions: {
        type: GraphQLList(documentPermissionType),
        args: {
          id: {type: GraphQLNonNull(GraphQLID)},
        },
        resolve: async (value, args, request) => {
          return this.getDocumentPermissions(args.id)
        },
      },
      checkDocumentAccess: {
        type: new GraphQLObjectType({
          name: 'checkDocumentAccess',
          fields: () => ({
            read: {type: GraphQLBoolean},
            write: {type: GraphQLBoolean}
          })
        }),
        args: {
          id: {
            type: GraphQLNonNull(GraphQLID)
          }
        },
        resolve: async (value, args, request) => {
          const id = _.get(args, 'id')
          const userId = _.get(request, 'token.userId')

          return new Promise(async (resolve, reject) => {
            if (!userId) {
              return resolve(
                {
                  read: false,
                  write: false
                }
              )
            }
            this.checkDocumentAccess(id, userId).then((access) => resolve(access)).catch(e => reject(e))

          })

        }
      }
    }

    return Object.assign(parentQuery, query)
  }

  fields () {

    return {
      _id: {
        primary: true,
        type: GraphQLID,
      },
      title: {
        type: GraphQLString,
        default: 'Untitled document',
        createIndex: 'text',
      },
      userId: {
        type: GraphQLID,
        objectId: true,
        required: true,
      },
      driveId: {
        type: GraphQLString,
        default: null,
      },
      readPermissions: {
        type: GraphQLList(GraphQLID),
        default: [],
      },
      writePermissions: {
        type: GraphQLList(GraphQLID),
        default: [],
      },
      body: {
        type: GraphQLString,
        default: '',
        createIndex: 'text',
      },
      inactiveGfx: {
        type: GraphQLString,
      },
      updated: {
        type: DateTime,
      },
      created: {
        type: DateTime,
      },

    }
  }

  relations () {
    return {
      user: {
        type: 'belongTo',
        foreignField: '_id',
        localField: 'userId',
        model: this.database.models().user,
        fields: ['_id', 'firstName', 'lastName', 'avatar'],
      },

    }
  }

  permissions () {

    return [
      {
        accessType: '*',
        role: 'everyone',
        permission: 'DENY',
      },
      {
        accessType: '*',
        role: 'administrator',
        permission: 'ALLOW',
      },
      {
        accessType: '*',
        role: 'staff',
        permission: 'ALLOW',
      },
      {
        accessType: 'findById',
        role: 'owner',
        permission: 'ALLOW',
      },
      {
        accessType: 'updateById',
        role: 'owner',
        permission: 'ALLOW',
      },
      {
        accessType: 'create',
        role: 'staff',
        permission: 'ALLOW',
      },
      {
        accessType: 'find',
        role: 'staff',
        permission: 'ALLOW',
      },
      {
        accessType: 'findById',
        role: 'staff',
        permission: 'ALLOW',
      },
      {
        accessType: 'updateById',
        role: 'staff',
        permission: 'ALLOW',
      },
      {
        accessType: 'deleteById',
        role: 'staff',
        permission: 'ALLOW',
      },
      {
        accessType: 'createDocumentPermission',
        role: 'staff',
        permission: 'ALLOW',
      },
      {
        accessType: 'createDocumentPermission',
        role: 'owner',
        permission: 'ALLOW',
      },
    ]
  }
}
