import React from 'react'
import styled from 'styled-components'
import _ from 'lodash'
import { TextField, Button } from '@material-ui/core'
import { isEmail } from '../../helper/validation'
import { history } from '../../hostory'
import { connect } from 'react-redux'
import { bindActionCreators } from 'redux'
import { createUser, updateUser } from '../../redux/actions'
import UserRoleSelect from './user-role-select'

const Container = styled.div `

  .form-actions {
    button {
      margin: 5px;
      &:first-child{
        margin-left: 0;
      }
    }
  }
`

class UserForm extends React.Component {

  constructor (props) {
    super(props)

    this._onChange = this._onChange.bind(this)
    this._onSubmit = this._onSubmit.bind(this)
    this.validate = this.validate.bind(this)
    this.getFields = this.getFields.bind(this)

    this.state = {
      submitted: false,
      message: null,
      error: {},
      model: {
        firstName: '',
        lastName: '',
        password: '',
        email: '',
        avatar: null,
        roles: [],
      },
      fields: [
        {
          name: 'firstName',
          type: 'text',
          label: 'First name',
          required: true,
        },
        {
          name: 'lastName',
          type: 'text',
          label: 'Last name',
          required: true,
        },
        {
          name: 'email',
          type: 'email',
          label: 'Email',
          required: true,
        },
        {
          name: 'password',
          type: 'password',
          label: 'Password',
          required: !_.get(this.props, 'editMode', false),
        },

      ],
      roleList: [],
      userRoles: [],
      needUpdateRole: false,
    }

  }

  componentDidMount () {

    const {editMode} = this.props

    if (editMode) {
      let model = this.props.model
      model.password = ''
      this.setState({
        model: model,
      })

    }
    this.props.getRoles().then((data) => {
      this.setState({
        roleList: _.get(data, 'roleList', []),
        userRoles: _.get(data, 'userRoles', []),
      })
    })

  }

  _onChange (e) {

    const name = e.target.name
    const value = e.target.value

    this.setState({
      ...this.state,
      model: {
        ...this.state.model,
        [name]: value,
      },
    }, () => {
      this.validate(name)
    })

  }

  _onSubmit (e) {
    const {editMode, currentUser} = this.props
    const {model} = this.state

    e.preventDefault()

    this.validate([], (errors) => {

      if (!errors || errors.length === 0) {
        // let do form submit
        this.setState({
          submitted: true,
        }, () => {

          const userRolesValues = _.get(currentUser, 'roles', [])

          if (!editMode) {
            this.props.createUser(model).then(() => {

              if (_.includes(userRolesValues, 'administrator') || _.includes(userRolesValues, 'staff')) {
                history.push('/users')
              } else {
                history.push('/')
              }

            }).catch(err => {

              this.setState({
                submitted: false,
              })
            })
          } else {

            this.props.updateUser(model).then(() => {
              if (_.includes(userRolesValues, 'administrator') || _.includes(userRolesValues, 'staff')) {
                history.push('/users')
              } else {
                history.push('/')
              }
            }).catch(e => {

              this.setState({
                submitted: false,
              })
            })
          }

        })

      }
    })

  }

  getFields (names = []) {

    let items = []

    if (!names || names.length === 0) {
      return this.state.fields
    }
    _.each(names, (name) => {
      let item = this.state.fields.find((f) => f.name === name)
      if (item) {
        items.push(item)
      }
    })

    return items
  }

  validate (fieldNames = [], cb = () => {
  }) {
    let {model, error} = this.state

    let errors = []

    let errorMessage = ''

    if (!Array.isArray(fieldNames) && fieldNames !== null) {
      fieldNames = [fieldNames]
    }

    let fieldItems = this.getFields(fieldNames)

    if (fieldNames.length === 0) {
      fieldItems = this.getFields(null)
    }
    _.each(fieldItems, (settings) => {

      const isRequired = _.get(settings, 'required', false)
      const emailField = _.get(settings, 'email', false)

      const name = _.get(settings, 'name')
      const label = _.get(settings, 'label', name)
      const value = _.get(model, name)

      _.unset(error, name)
      if (isRequired && !value) {
        errorMessage = `${label} is required`
        error = _.setWith(error, name, true)
        errors.push(errorMessage)
      }

      if (emailField && !isEmail(value)) {
        errorMessage = `${label} must email address`
        error = _.setWith(error, name, true)
        errors.push(errorMessage)
      }
    })
    this.setState({
      error: error,
    }, () => {
      return cb(errors)
    })
  }

  render () {
    const {editMode} = this.props
    const {model, submitted, error} = this.state

    let userRoles = _.get(model, 'roles', [])
    if (userRoles === null) {
      userRoles = []
    }

    return (<Container>
      <form onSubmit={this._onSubmit} noValidate autoComplete={'off'}>
        {this.state.fields.map((field, index) => {
          const name = _.get(field, 'name')
          return (
            <TextField
              key={'TextField'+index+name}
              name={name}
              error={_.get(error, name, false)}
              id={name}
              label={field.label}
              value={_.get(model, name, '')}
              margin="normal"
              fullWidth
              type={_.get(field, 'type', 'text')}
              onChange={this._onChange}
            />
          )

        })}
        {
          this.state.roleList.length ? (
            <UserRoleSelect
              onChange={(selected) => {
                this.setState({
                  needUpdateRole: true,
                  model: {
                    ...this.state.model,
                    roles: selected,
                  },
                })
              }} value={userRoles}
              options={this.state.roleList}/>
          ) : null
        }
        <div className={'form-actions'}>
          <Button
            disabled={submitted}
            variant="raised" color={'primary'}
            type={'submit'}
            size="medium">
            {
              editMode ? 'Save' : 'Create'
            }
          </Button>
          <Button onClick={() => {
            history.push('/users')
          }} disabled={submitted}
                  type={'button'}
                  size="medium">
            Cancel
          </Button>
        </div>
      </form>
    </Container>)
  }
}

const mapStateToProps = (state) => ({
  currentUser: state.app.currentUser
})

const mapDispatchToProps = (dispatch) => bindActionCreators({
  createUser,
  updateUser,
  getRoles: () => {
    return (dispatch, getState, {service}) => {

      return new Promise((resolve, reject) => {

        const q = [
          {
            name: 'roleList',
            params: null,
            fields: null,
          },
        ]
        service.queryMany(q).then((data) => {

          return resolve(data)
        }).catch((err) => {
          return reject(err)
        })
      })
    }
  },
}, dispatch)
export default connect(mapStateToProps, mapDispatchToProps)(UserForm)