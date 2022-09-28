import React from "react";
import {Button, Col, DatePicker, Descriptions, Empty, Input, Popconfirm, Row, Select, Spin, Tooltip, Tree, Upload} from 'antd';
import {CloudUploadOutlined, createFromIconfontCN, DeleteOutlined, DownloadOutlined, FileDoneOutlined, FolderAddOutlined} from "@ant-design/icons";
import moment from "moment";
import * as Setting from "./Setting";
import * as FileBackend from "./backend/FileBackend";
import DocViewer, { DocViewerRenderers } from "@cyntler/react-doc-viewer";
import FileViewer from 'react-file-viewer';
import i18next from "i18next";
import * as PermissionBackend from "./backend/PermissionBackend";
import * as PermissionUtil from "./PermissionUtil";
import * as Conf from "./Conf";
import FileTable from "./FileTable";

import {Controlled as CodeMirror} from "react-codemirror2";
import "codemirror/lib/codemirror.css";
// require("codemirror/theme/material-darker.css");
// require("codemirror/mode/javascript/javascript");

const { Search } = Input;
const { Option } = Select;

const IconFont = createFromIconfontCN({
  scriptUrl: 'https://cdn.open-ct.com/icon/iconfont.js',
});

class FileTree extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      classes: props,
      expandedKeys: ['0-0', '0-0-0', '0-0-0-0'],
      checkedKeys: [],
      checkedFiles: [],
      selectedKeys: [],
      selectedFile: null,
      loading: false,
      text: null,
      newFolder: null,
      permissions: null,
      permissionMap: null,
      searchValue: "",
    };

    this.filePane = React.createRef();
    this.uploadedFileIdMap = {};
  }

  componentWillMount() {
    this.getPermissions();
  }

  getPermissionMap(permissions) {
    let permissionMap = {};
    permissions.forEach((permission, index) => {
      if (permissionMap[permission.resources[0]] === undefined) {
        permissionMap[permission.resources[0]] = [];
      }
      permissionMap[permission.resources[0]].push(permission);
    });
    return permissionMap;
  }

  getPermissions() {
    PermissionBackend.getPermissions(Conf.AuthConfig.organizationName)
      .then((permissions) => {
        permissions = permissions.filter(permission => (permission.domains[0] === this.props.store.name) && permission.users.length !== 0);
        this.setState({
          permissions: permissions,
          permissionMap: this.getPermissionMap(permissions),
        });
      });
  }

  updateStore(store) {
    this.props.onUpdateStore(store);
  }

  uploadFile(file, info) {
    const storeId = `${this.props.store.owner}/${this.props.store.name}`;

    const promises = [];
    info.fileList.forEach((uploadedFile, index) => {
      if (this.uploadedFileIdMap[uploadedFile.originFileObj.uid] === 1) {
        return;
      } else {
        this.uploadedFileIdMap[uploadedFile.originFileObj.uid] = 1;
      }

      promises.push(FileBackend.addFile(storeId, file.key, true, uploadedFile.name, uploadedFile.originFileObj));
    });

    Promise.all(promises)
      .then((values) => {
        Setting.showMessage("success", `File uploaded successfully`);
        this.props.onRefresh();
      })
      .catch(error => {
        Setting.showMessage("error", `File failed to upload: ${error}`);
      });
  };

  addFile(file, newFolder) {
    const storeId = `${this.props.store.owner}/${this.props.store.name}`;
    FileBackend.addFile(storeId, file.key, false, newFolder, null)
      .then((res) => {
        Setting.showMessage("success", `File added successfully`);
        this.props.onRefresh();
      })
      .catch(error => {
        Setting.showMessage("error", `File failed to add: ${error}`);
      });
  }

  deleteFile(file, isLeaf) {
    const storeId = `${this.props.store.owner}/${this.props.store.name}`;
    FileBackend.deleteFile(storeId, file.key, isLeaf)
      .then((res) => {
        if (res === true) {
          Setting.showMessage("success", `File deleted successfully`);
          this.props.onRefresh();
        } else {
          Setting.showMessage("error", `File failed to delete: ${res}`);
        }
      })
      .catch(error => {
        Setting.showMessage("error", `File failed to delete: ${error}`);
      });
  }

  renderPermission(permission, isReadable) {
    if (!isReadable) {
      const userId = `${this.props.account.owner}/${this.props.account.name}`;
      if (!permission.users.includes(userId)) {
        return null;
      }
    }

    return (
      <span key={permission.name}
        onClick={(e) => {
        Setting.openLink(Setting.getMyProfileUrl(this.props.account).replace("/account", `/permissions/${permission.owner}/${permission.name}`));
        e.stopPropagation();
      }}
      >
        {
          permission.users.map(user => {
            const username = user.split("/")[1];
            return (
              <span key={username}>
                {
                  Setting.getTag(username, permission.actions[0], permission.state)
                }
              </span>
            )
          })
        }
      </span>
    )
  }

  renderPermissions(permissions, isReadable) {
    if (permissions === undefined) {
      return null;
    }

    return permissions.map(permission => this.renderPermission(permission, isReadable)).filter(permission => permission !== null);
  }

  isActionIncluded(action1, action2) {
    if (action1 === "Read") {
      return true;
    } else if (action1 === "Write" && action2 !== "Read") {
      return true;
    } else if (action1 === "Admin" && action2 === "Admin") {
      return true;
    } else {
      return false;
    }
  }

  isFileOk(file, action) {
    if (this.state.permissionMap === null) {
      return false;
    }

    const permissions = this.state.permissionMap[file.key];
    if (permissions !== undefined) {
      for (let i = 0; i < permissions.length; i++) {
        const permission = permissions[i];

        const userId = `${this.props.account.owner}/${this.props.account.name}`;
        if (permission.state === "Approved" && permission.isEnabled === true && permission.resources[0] === file.key && permission.users.includes(userId) && this.isActionIncluded(action, permission.actions[0])) {
          return true;
        }
      }
    }

    if (file.parent !== undefined) {
      return this.isFileOk(file.parent, action);
    }
    return false;
  }

  isFileReadable(file) {
    return this.isFileOk(file, "Read")
  }

  isFileWritable(file) {
    return this.isFileOk(file, "Write")
  }

  isFileAdmin(file) {
    if (Setting.isLocalAdminUser(this.props.account)) {
      return true;
    }

    return this.isFileOk(file, "Admin")
  }

  renderSearch() {
    return (
      <Search placeholder={i18next.t("store:Please input your search term")} onChange={(e) => {
        this.setState({
          searchValue: e.target.value,
          selectedKeys: [],
          selectedFile: null,
        });
      }} />
    )
  }

  renderTree(store) {
    const onSelect = (selectedKeys, info) => {
      if (!this.isFileReadable(info.node)) {
        Setting.showMessage("error", i18next.t("store:Sorry, you are unauthorized to access this file or folder"));
        return;
      }

      if (selectedKeys.length !== 0) {
        const path = selectedKeys[0];
        const ext = Setting.getExtFromPath(path);
        if (ext !== "") {
          const url = `${store.domain}/${path}`;

          if (!this.isExtForDocViewer((ext) && !this.isExtForFileViewer(ext))) {
            this.setState({
              loading: true,
            });

            fetch(url, {method: 'GET'})
              .then(res => res.text())
              .then(res => {
                this.setState({
                  text: res,
                  loading: false,
                });
            });
          }
        }
      }

      this.setState({
        checkedKeys: [],
        checkedFiles: [],
        selectedKeys: selectedKeys,
        selectedFile: info.node,
      });
    };

    const onCheck = (checkedKeys, info) => {
      this.setState({
        checkedKeys: checkedKeys,
        checkedFiles: info.checkedNodes,
        selectedKeys: [],
        selectedFile: null,
      });
    };

    let fileTree = Setting.getTreeWithParents(store.fileTree);
    if (this.state.searchValue !== "") {
      fileTree = Setting.getTreeWithSearch(fileTree, this.state.searchValue);
    }

    return (
      <Tree
        height={"calc(100vh - 170px)"}
        virtual={false}
        className="draggable-tree"
        multiple={false}
        checkable
        defaultExpandAll={true}
        // defaultExpandedKeys={tree.children.map(file => file.key)}
        draggable={false}
        blockNode
        showLine={true}
        showIcon={true}
        onCheck={onCheck}
        checkedKeys={this.state.checkedKeys}
        onSelect={onSelect}
        selectedKeys={this.state.selectedKeys}
        treeData={[fileTree]}
        titleRender={(file) => {
          const isReadable = this.isFileReadable(file);
          const isWritable = this.isFileWritable(file);
          const isAdmin = this.isFileAdmin(file);

          let tagStyle = {};
          if (!isReadable && !isWritable && !isAdmin) {
            tagStyle = {color: "rgba(100,100,100,0.6)", backgroundColor: "rgba(225,225,225,0.4)"};
          }

          if (file.isLeaf) {
            return (
              <Tooltip color={"rgb(255,255,255,0.8)"} placement="right" title={
                <div>
                  {
                    !isReadable ? null : (
                      <Tooltip title={i18next.t("store:Download")}>
                        <Button style={{marginRight: "5px"}} icon={<DownloadOutlined />} size="small" onClick={(e) => {
                          Setting.showMessage("success", "Successfully downloaded");
                          const url = `${store.domain}/${file.key}`;
                          Setting.openLink(url);
                          e.stopPropagation();
                        }} />
                      </Tooltip>
                    )
                  }
                  {
                    !isWritable ? null : (
                      <React.Fragment>
                        {/*<Tooltip title={i18next.t("store:Rename")}>*/}
                        {/*  <Button style={{marginRight: "5px"}} icon={<EditOutlined />} size="small" onClick={(e) => {*/}
                        {/*    Setting.showMessage("error", "Rename");*/}
                        {/*    e.stopPropagation();*/}
                        {/*  }} />*/}
                        {/*</Tooltip>*/}
                        {/*<Tooltip title={i18next.t("store:Move")}>*/}
                        {/*  <Button style={{marginRight: "5px"}} icon={<RadiusSettingOutlined />} size="small" onClick={(e) => {*/}
                        {/*    Setting.showMessage("error", "Move");*/}
                        {/*    e.stopPropagation();*/}
                        {/*  }} />*/}
                        {/*</Tooltip>*/}
                        <Tooltip title={i18next.t("store:Delete")}>
                        <span onClick={(e) => e.stopPropagation()}>
                          <Popconfirm
                            title={`Sure to delete file: ${file.title} ?`}
                            onConfirm={(e) => {
                              this.deleteFile(file, true);
                            }}
                            okText="OK"
                            cancelText="Cancel"
                          >
                            <Button style={{marginRight: "5px"}} icon={<DeleteOutlined />} size="small" />
                          </Popconfirm>
                        </span>
                        </Tooltip>
                      </React.Fragment>
                    )
                  }
                  <Tooltip title={isAdmin ? i18next.t("store:Add Permission") :
                    i18next.t("store:Apply for Permission")}>
                    <Button icon={<FileDoneOutlined />} size="small" onClick={(e) => {
                      PermissionUtil.addPermission(this.props.account, this.props.store, file);
                      e.stopPropagation();
                    }} />
                  </Tooltip>
                </div>
              }>
                <span style={tagStyle}>
                  {`${file.title} (${Setting.getFriendlyFileSize(file.size)})`}
                </span>
                &nbsp;
                &nbsp;
                {
                  (this.state.permissionMap === null) ? null : this.renderPermissions(this.state.permissionMap[file.key], isReadable)
                }
              </Tooltip>
            )
          } else {
            return (
              <Tooltip color={"rgb(255,255,255,0.8)"} placement="right" title={
                <div>
                  {
                    !isWritable ? null : (
                      <React.Fragment>
                        <Tooltip color={"rgb(255,255,255)"} placement="top" title={
                          <span onClick={(e) => e.stopPropagation()}>
                            <div style={{color: "black"}}>
                              {i18next.t("store:New folder")}:
                            </div>
                            <Input.Group style={{marginTop: "5px"}} compact>
                              <Input style={{width: "100px"}} value={this.state.newFolder} onChange={e => {
                                this.setState({
                                  newFolder: e.target.value,
                                });
                              }} />
                              <Button type="primary" onClick={(e) => {
                                this.addFile(file, this.state.newFolder);
                                e.stopPropagation();
                              }}
                              >
                                OK
                              </Button>
                            </Input.Group>
                          </span>
                        }>
                          <span onClick={(e) => e.stopPropagation()}>
                            <Button style={{marginRight: "5px"}} icon={<FolderAddOutlined />} size="small" onClick={(e) => {
                              this.addFile();
                              e.stopPropagation();
                            }} />
                          </span>
                        </Tooltip>
                        <Tooltip title={i18next.t("store:Upload file")}>
                          <span onClick={(e) => e.stopPropagation()}>
                            <Upload multiple={true} accept="*" showUploadList={false} beforeUpload={file => {return false;}} onChange={(info) => {
                              this.uploadFile(file, info);
                            }}
                            >
                            <Button style={{marginRight: "5px"}} icon={<CloudUploadOutlined />} size="small" />
                          </Upload>
                          </span>
                        </Tooltip>
                        {
                          file.key === "/" ? null : (
                            <Tooltip title={i18next.t("store:Delete")}>
                              <span onClick={(e) => e.stopPropagation()}>
                                <Popconfirm
                                  title={`Sure to delete folder: ${file.title} ?`}
                                  onConfirm={(e) => {
                                    this.deleteFile(file, false);
                                  }}
                                  okText="OK"
                                  cancelText="Cancel"
                                >
                                  <Button style={{marginRight: "5px"}} icon={<DeleteOutlined />} size="small" />
                                </Popconfirm>
                              </span>
                            </Tooltip>
                          )
                        }
                      </React.Fragment>
                    )
                  }
                  <Tooltip title={isAdmin ? i18next.t("store:Add Permission") :
                    i18next.t("store:Apply for Permission")}>
                    <Button icon={<FileDoneOutlined />} size="small" onClick={(e) => {
                      PermissionUtil.addPermission(this.props.account, this.props.store, file);
                      e.stopPropagation();
                    }} />
                  </Tooltip>
                </div>
              }>
                <span style={tagStyle}>
                  {file.title}
                </span>
                &nbsp;
                &nbsp;
                {
                  (this.state.permissionMap === null) ? null : this.renderPermissions(this.state.permissionMap[file.key], isReadable)
                }
              </Tooltip>
            )
          }
        }}
        icon={(file) => {
          if (file.isLeaf) {
            const ext = Setting.getExtFromPath(file.data.key);
            if (ext === "pdf") {
              return <IconFont type='icon-testpdf' />
            } else if (ext === "doc" || ext === "docx") {
              return <IconFont type='icon-testdocx' />
            } else if (ext === "ppt" || ext === "pptx") {
              return <IconFont type='icon-testpptx' />
            } else if (ext === "xls" || ext === "xlsx") {
              return <IconFont type='icon-testxlsx' />
            } else if (ext === "txt") {
              return <IconFont type='icon-testdocument' />
            } else if (ext === "png" || ext === "bmp" || ext === "jpg" || ext === "jpeg" || ext === "svg") {
              return <IconFont type='icon-testPicture' />
            } else if (ext === "html") {
              return <IconFont type='icon-testhtml' />
            } else if (ext === "js") {
              return <IconFont type='icon-testjs' />
            } else if (ext === "css") {
              return <IconFont type='icon-testcss' />
            } else {
              return <IconFont type='icon-testfile-unknown' />
            }
          } else {
            return <IconFont type='icon-testfolder' />
          }
        }}
      />
    );
  }

  isExtForDocViewer(ext) {
    return ["bmp", "jpg", "jpeg", "png", "tiff", "doc", "docx", "ppt", "pptx", "xls", "xlsx", "pdf"].includes(ext);
  }

  isExtForFileViewer(ext) {
    return ["png", "jpg", "jpeg", "gif", "bmp", "pdf", "csv", "xlsx", "docx", "mp4", "webm", "mp3"].includes(ext);
  }

  renderFileViewer(store) {
    if (this.state.checkedFiles.length !== 0) {
      const outerFile = {children: this.state.checkedFiles};
      return (
        <FileTable account={this.props.account} store={this.props.store} onRefresh={() => this.props.onRefresh()} file={outerFile} isCheckMode={true} />
      )
    }

    if (this.state.selectedKeys.length === 0) {
      return null;
    }

    const file = this.state.selectedFile;
    if (file === null) {
      return null;
    }

    const path = this.state.selectedKeys[0];
    const filename = path.split("/").pop();

    if (!file.isLeaf) {
      return (
        <FileTable account={this.props.account} store={this.props.store} onRefresh={() => this.props.onRefresh()} file={file} isCheckMode={false} />
      )
    }

    if (!filename.includes(".")) {
      return (
        <div style={{height: this.getEditorHeightCss()}}>
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />
        </div>
      );
    }

    const ext = Setting.getExtFromPath(path);
    const url = `${store.domain}/${path}`;

    if (this.isExtForDocViewer(ext)) {
      // https://github.com/Alcumus/react-doc-viewer
      return (
        <DocViewer
          key={path}
          style={{height: this.getEditorHeightCss()}}
          pluginRenderers={DocViewerRenderers}
          documents={[{uri: url}]}
          theme={{
            primary: "rgb(92,48,125)",
            secondary: "#ffffff",
            tertiary: "rgba(92,48,125,0.55)",
            text_primary: "#ffffff",
            text_secondary: "rgb(92,48,125)",
            text_tertiary: "#00000099",
            disableThemeScrollbar: false,
          }}
          config={{
            header: {
              disableHeader: true,
              disableFileName: true,
              retainURLParams: false
            }
          }}
        />
      );
    } else if (this.isExtForFileViewer(ext)) {
      // https://github.com/plangrid/react-file-viewer
      return (
        <a target="_blank" rel="noreferrer" href={url}>
          <FileViewer
            key={path}
            fileType={ext}
            filePath={url}
            errorComponent={<div>error</div>}
            onError={(error) => {
              Setting.showMessage("error", error);
            }}
          />
        </a>
      );
    } else {
      // https://github.com/scniro/react-codemirror2
      if (this.state.loading) {
        return (
          <div className="App">
            <Spin size="large" tip={i18next.t("general:Loading...")} style={{paddingTop: "10%"}} />
          </div>
        );
      }

      return (
        <div style={{height: this.getEditorHeightCss()}}>
          <CodeMirror
            key={path}
            value={this.state.text}
            // options={{mode: "javascript", theme: "material-darker"}}
            onBeforeChange={(editor, data, value) => {}}
          />
        </div>
      );
    }
  }

  getPropertyValue(file, propertyName) {
    const properties = this.props.store.propertiesMap[file.key];
    if (properties === undefined) {
      return "";
    } else {
      return properties[propertyName];
    }
  }

  setPropertyValue(file, propertyName, value) {
    let store = this.props.store;
    if (store.propertiesMap[file.key] === undefined) {
      store.propertiesMap[file.key] = {};
    }
    store.propertiesMap[file.key][propertyName] = value;
    this.updateStore(store);
  }

  getMomentTime(t) {
    if (t === "") {
      return ""
    } else {
      return new moment(t);
    }
  }

  renderProperties() {
    if (this.state.selectedKeys.length === 0) {
      return null;
    }

    const file = this.state.selectedFile;
    if (file === null) {
      return null;
    }

    const subjectOptions = [
      {id: "Math", name: i18next.t("store:Math")},
      {id: "Chinese", name: i18next.t("store:Chinese")},
      {id: "English", name: i18next.t("store:English")},
      {id: "Science", name: i18next.t("store:Science")},
      {id: "Physics", name: i18next.t("store:Physics")},
      {id: "Chemistry", name: i18next.t("store:Chemistry")},
      {id: "Biology", name: i18next.t("store:Biology")},
      {id: "History", name: i18next.t("store:History")},
    ];

    const getSubjectDisplayName = (id) => {
      const options = subjectOptions.filter(option => option.id === id);
      if (options.length === 0) {
        return "";
      } else {
        return options[0].name;
      }
    };

    return (
      <div ref={this.filePane}>
        <Descriptions
          style={{backgroundColor: "white"}}
          labelStyle={{backgroundColor: "rgb(245,245,245)"}}
          bordered
          // title="Custom Size"
          size="small"
          // extra={<Button type="primary">Edit</Button>}
        >
          <Descriptions.Item label={i18next.t("vectorset:File name")}>
            {file.title}
          </Descriptions.Item>
          <Descriptions.Item label={i18next.t("store:File type")}>
            {Setting.getExtFromFile(file)}
          </Descriptions.Item>
          <Descriptions.Item label={i18next.t("vectorset:File size")}>
            {Setting.getFriendlyFileSize(file.size)}
          </Descriptions.Item>
          <Descriptions.Item label={i18next.t("general:Created time")}>
            {Setting.getFormattedDate(file.createdTime)}
          </Descriptions.Item>
          <Descriptions.Item label={i18next.t("store:Collected time")}>
            {Setting.getFormattedDate(Setting.getCollectedTime(file.title))}
            <DatePicker key={file.key} showTime defaultValue={this.getMomentTime(this.getPropertyValue(file, "collectedTime"))} onChange={(value, dateString) => {
              this.setPropertyValue(file, "collectedTime", value.format());
            }} onOk={(value) => {}} />
          </Descriptions.Item>
          <Descriptions.Item label={i18next.t("store:Subject")}>
            <Select virtual={false} style={{width: "120px"}} value={getSubjectDisplayName(this.getPropertyValue(file, "subject"))} onChange={(value => {
              this.setPropertyValue(file, "subject", value);
            })}>
              {
                subjectOptions.map((item, index) => <Option key={index} value={item.id}>{item.name}</Option>)
              }
            </Select>
          </Descriptions.Item>
        </Descriptions>
      </div>
    )
  }

  getEditorHeightCss() {
    // 79, 123
    const filePaneHeight = this.filePane.current?.offsetHeight;
    return `calc(100vh - ${filePaneHeight + 138}px)`;
  }

  render() {
    return (
      <div style={{backgroundColor: "rgb(232,232,232)", borderTop: "1px solid rgb(232,232,232)"}}>
        <Row>
          <Col span={8}>
            {
              this.renderSearch(this.props.store)
            }
            {
              this.renderTree(this.props.store)
            }
          </Col>
          <Col span={16}>
            <div>
              <div style={{height: this.getEditorHeightCss()}}>
                {
                  this.renderFileViewer(this.props.store)
                }
              </div>
              {
                this.renderProperties()
              }
            </div>
          </Col>
        </Row>
      </div>
    )
  }
}

export default FileTree;
