import { useEffect, useState, type ReactNode } from 'react'
import { Button, IconCloseFill14 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { WorkspaceId, WorkspaceView } from '@deepseek-ai/dsh-client-runtime/client'
import type { WorkspaceBrowserProps } from './contract/slots.ts'
import type { ProjectFileContent } from '@deepseek-ai/dsh-api-remotes/client'
import { ProjectCodeEditor } from './ProjectCodeEditor.tsx'
import css from './WorkspaceBrowser.module.css'

type FileState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; path: string; entries: readonly { name: string; path: string; type: 'file' | 'directory' }[]; truncated: boolean }

type EditorState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; path: string; content: string; version: ProjectFileContent['version']; saving: boolean; dirty: boolean; saveError?: string | undefined }

/** Project browser docked into the layout-owned right column. */
export function ProjectFilesPanel({
  closeProjectFiles, useWorkspaces, listProjectFiles, readProjectFile, saveProjectFile, createProjectFile,
}: Pick<WorkspaceBrowserProps, 'useWorkspaces' | 'listProjectFiles' | 'readProjectFile' | 'saveProjectFile' | 'createProjectFile'> & {
  closeProjectFiles: () => void
}): ReactNode {
  const workspaces = useWorkspaces(state => state.items)
  const [workspaceId, setWorkspaceId] = useState<WorkspaceId | undefined>()
  const [files, setFiles] = useState<FileState>({ status: 'idle' })
  const [editor, setEditor] = useState<EditorState>({ status: 'idle' })
  const [creating, setCreating] = useState(false)
  const [newFileName, setNewFileName] = useState('')
  const [createError, setCreateError] = useState<string | undefined>()

  const loadDirectory = (id: WorkspaceId, path = '.'): void => {
    setFiles({ status: 'loading' })
    setEditor({ status: 'idle' })
    void listProjectFiles(id, path).then(
      result => setFiles({ status: 'ready', ...result }),
      error => setFiles({ status: 'error', message: error instanceof Error ? error.message : String(error) }),
    )
  }
  useEffect(() => {
    const first = workspaceId ?? workspaces[0]?.workspaceId
    if (first === undefined) return
    if (workspaceId === undefined) setWorkspaceId(first)
    loadDirectory(first)
  // Opening or changing registered workspace intentionally resets to its root.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId])

  const selectWorkspace = (id: WorkspaceId): void => {
    if (!discardChanges()) return
    setCreating(false)
    setWorkspaceId(id)
    loadDirectory(id)
  }
  const openFile = (path: string): void => {
    if (workspaceId === undefined) return
    if (editor.status === 'ready' && !discardChanges()) return
    setEditor({ status: 'loading' })
    void readProjectFile(workspaceId, path).then(
      result => setEditor({ status: 'ready', ...result, saving: false, dirty: false }),
      error => setEditor({ status: 'error', message: error instanceof Error ? error.message : String(error) }),
    )
  }
  const save = (): void => {
    if (workspaceId === undefined || editor.status !== 'ready' || !editor.dirty) return
    setEditor({ ...editor, saving: true })
    void saveProjectFile(workspaceId, editor.path, editor.content, editor.version).then(
      result => setEditor({ status: 'ready', ...result, saving: false, dirty: false }),
      error => setEditor({ ...editor, saving: false, saveError: error instanceof Error ? error.message : String(error) }),
    )
  }
  const discardChanges = (): boolean => editor.status !== 'ready' || !editor.dirty || window.confirm('当前文件有未保存的修改，确定放弃吗？')
  const openDirectory = (path: string): void => {
    if (workspaceId !== undefined && discardChanges()) loadDirectory(workspaceId, path)
  }
  const createFile = (): void => {
    if (workspaceId === undefined || files.status !== 'ready') return
    const name = newFileName.trim()
    if (name.length === 0 || name === '.' || name === '..' || /[\\/]/.test(name)) {
      setCreateError('请输入当前目录内的有效文件名。')
      return
    }
    const path = files.path === '.' ? name : `${files.path}/${name}`
    setCreateError(undefined)
    void createProjectFile(workspaceId, path, '').then(
      result => {
        setCreating(false)
        setNewFileName('')
        setEditor({ status: 'ready', ...result, saving: false, dirty: false })
        void listProjectFiles(workspaceId, files.path).then(
          listing => setFiles({ status: 'ready', ...listing }),
          error => setFiles({ status: 'error', message: error instanceof Error ? error.message : String(error) }),
        )
      },
      error => setCreateError(error instanceof Error ? error.message : String(error)),
    )
  }
  const close = (): void => { if (discardChanges()) closeProjectFiles() }

  return <section className={css.projectFilesDock} aria-label="项目文件">
    <header className={css.projectFilesHeader}>
      <strong>项目文件</strong>
      <button type="button" className={css.iconButton} aria-label="关闭项目文件" onClick={close}>
        <IconCloseFill14 />
      </button>
    </header>
    <div className={css.projectFilesContent}>
      {workspaces.length === 0 ? <p className={css.projectFilesEmpty}>请先添加一个工作区。</p> : <div className={css.projectFiles}>
        <label className={css.projectWorkspaceSelect}><span>工作区</span><select value={workspaceId ?? ''} onChange={event => selectWorkspace(event.currentTarget.value as WorkspaceId)}>
          {workspaces.map((workspace: WorkspaceView) => <option key={workspace.workspaceId} value={workspace.workspaceId}>{workspace.title}</option>)}
        </select></label>
        {files.status === 'loading' ? <p>正在读取文件…</p> : null}
        {files.status === 'error' ? <p role="alert">{files.message}</p> : null}
        {files.status === 'ready' ? <div className={css.projectFilesBody}>
          <div className={css.projectEditor}>
            {editor.status === 'idle' ? <p>选择一个文件以查看和编辑。</p> : null}
            {editor.status === 'loading' ? <p>正在读取文件…</p> : null}
            {editor.status === 'error' ? <p role="alert">{editor.message}</p> : null}
            {editor.status === 'ready' ? <>
              <div className={css.projectEditorToolbar}>
                <div className={css.projectEditorTitle} title={editor.path}>{editor.path}{editor.dirty ? <span className={css.projectEditorDirty}>未保存</span> : null}</div>
                <Button variant="primary" disabled={!editor.dirty || editor.saving} onClick={save}>{editor.saving ? '保存中…' : '保存'}</Button>
              </div>
              <ProjectCodeEditor
                path={editor.path}
                value={editor.content}
                onChange={content => setEditor({ ...editor, content, dirty: true, saveError: undefined })}
                onSave={save}
                saving={editor.saving}
              />
              {editor.saveError === undefined ? null : <p className={css.projectEditorSaveError} role="alert">保存失败：{editor.saveError}</p>}
            </> : null}
          </div>
          <div className={css.projectTree}>
            <div className={css.projectTreeHeader}><span>文件{files.path === '.' ? '' : ` · ${files.path}`}</span><button className={css.projectNewFileButton} type="button" onClick={() => { setCreating(true); setCreateError(undefined) }} aria-label="新建文件">＋</button></div>
            {creating ? <form className={css.projectNewFileForm} onSubmit={(event) => { event.preventDefault(); createFile() }}><input className={css.projectNewFileInput} autoFocus value={newFileName} onChange={event => setNewFileName(event.currentTarget.value)} placeholder="新文件名，例如 config.ts" /><div className={css.projectNewFileActions}><button type="submit">创建</button><button type="button" onClick={() => { setCreating(false); setCreateError(undefined) }}>取消</button></div>{createError === undefined ? null : <p className={css.projectTreeError} role="alert">{createError}</p>}</form> : null}
            {files.path !== '.' ? <button className={css.projectTreeRow} type="button" onClick={() => openDirectory(files.path.split('/').slice(0, -1).join('/') || '.')}><span className={css.projectFileIcon}>↩</span>上一级</button> : null}
            {files.entries.map(entry => <button key={entry.path} className={`${css.projectTreeRow} ${entry.type === 'file' && editor.status === 'ready' && editor.path === entry.path ? css.projectTreeRowActive : ''}`} type="button" onClick={() => entry.type === 'directory' ? openDirectory(entry.path) : openFile(entry.path)}><span className={css.projectFileIcon}>{entry.type === 'directory' ? '⌄' : '•'}</span><span>{entry.name}</span></button>)}
            {files.truncated ? <p>目录内容过多，仅显示前一部分。</p> : null}
          </div>
        </div> : null}
      </div>}
    </div>
  </section>
}
