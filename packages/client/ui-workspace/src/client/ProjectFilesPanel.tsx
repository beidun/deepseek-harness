import { useEffect, useState, type ReactNode } from 'react'
import { Button, IconCloseFill14 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { WorkspaceId, WorkspaceView } from '@deepseek-ai/dsh-client-runtime/client'
import type { WorkspaceBrowserProps } from './contract/slots.ts'
import type { ProjectFileContent } from '@deepseek-ai/dsh-api-remotes/client'
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
  | { status: 'ready'; path: string; content: string; version: ProjectFileContent['version']; saving: boolean }

/** Docked project browser that replaces the sidebar's workspace/session view. */
export function ProjectFilesPanel({
  open, onClose, useWorkspaces, listProjectFiles, readProjectFile, saveProjectFile,
}: Pick<WorkspaceBrowserProps, 'useWorkspaces' | 'listProjectFiles' | 'readProjectFile' | 'saveProjectFile'> & {
  open: boolean
  onClose: () => void
}): ReactNode {
  const workspaces = useWorkspaces(state => state.items)
  const [workspaceId, setWorkspaceId] = useState<WorkspaceId | undefined>()
  const [files, setFiles] = useState<FileState>({ status: 'idle' })
  const [editor, setEditor] = useState<EditorState>({ status: 'idle' })

  const loadDirectory = (id: WorkspaceId, path = '.'): void => {
    setFiles({ status: 'loading' })
    setEditor({ status: 'idle' })
    void listProjectFiles(id, path).then(
      result => setFiles({ status: 'ready', ...result }),
      error => setFiles({ status: 'error', message: error instanceof Error ? error.message : String(error) }),
    )
  }
  useEffect(() => {
    if (!open) return
    const first = workspaceId ?? workspaces[0]?.workspaceId
    if (first === undefined) return
    if (workspaceId === undefined) setWorkspaceId(first)
    loadDirectory(first)
  // Opening or changing registered workspace intentionally resets to its root.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, workspaceId])

  const selectWorkspace = (id: WorkspaceId): void => {
    setWorkspaceId(id)
    loadDirectory(id)
  }
  const openFile = (path: string): void => {
    if (workspaceId === undefined) return
    setEditor({ status: 'loading' })
    void readProjectFile(workspaceId, path).then(
      result => setEditor({ status: 'ready', ...result, saving: false }),
      error => setEditor({ status: 'error', message: error instanceof Error ? error.message : String(error) }),
    )
  }
  const save = (): void => {
    if (workspaceId === undefined || editor.status !== 'ready') return
    setEditor({ ...editor, saving: true })
    void saveProjectFile(workspaceId, editor.path, editor.content, editor.version).then(
      result => setEditor({ status: 'ready', ...result, saving: false }),
      error => setEditor({ status: 'error', message: error instanceof Error ? error.message : String(error) }),
    )
  }

  if (!open) return null

  return <section className={css.projectFilesDock} aria-label="项目文件">
    <header className={css.projectFilesHeader}>
      <strong>项目文件</strong>
      <button type="button" className={css.iconButton} aria-label="关闭项目文件" onClick={onClose}>
        <IconCloseFill14 />
      </button>
    </header>
    <div className={css.projectFilesContent}>
      {workspaces.length === 0 ? <p>请先添加一个工作区。</p> : <div className={css.projectFiles}>
        <label>工作区<select value={workspaceId ?? ''} onChange={event => selectWorkspace(event.currentTarget.value as WorkspaceId)}>
          {workspaces.map((workspace: WorkspaceView) => <option key={workspace.workspaceId} value={workspace.workspaceId}>{workspace.title}</option>)}
        </select></label>
        {files.status === 'loading' ? <p>正在读取文件…</p> : null}
        {files.status === 'error' ? <p role="alert">{files.message}</p> : null}
        {files.status === 'ready' ? <div className={css.projectFilesBody}>
          <div className={css.projectTree}>
            {files.path !== '.' ? <button type="button" onClick={() => loadDirectory(workspaceId!, files.path.split('/').slice(0, -1).join('/') || '.')}>..</button> : null}
            {files.entries.map(entry => <button key={entry.path} type="button" onClick={() => entry.type === 'directory' ? loadDirectory(workspaceId!, entry.path) : openFile(entry.path)}>{entry.type === 'directory' ? '📁 ' : '📄 '}{entry.name}</button>)}
            {files.truncated ? <p>目录内容过多，仅显示前一部分。</p> : null}
          </div>
          <div className={css.projectEditor}>
            {editor.status === 'idle' ? <p>选择一个文件以查看和编辑。</p> : null}
            {editor.status === 'loading' ? <p>正在读取文件…</p> : null}
            {editor.status === 'error' ? <p role="alert">{editor.message}</p> : null}
            {editor.status === 'ready' ? <><div className={css.projectEditorTitle}>{editor.path}</div><textarea aria-label={editor.path} value={editor.content} onChange={event => setEditor({ ...editor, content: event.currentTarget.value })} /><Button variant="primary" disabled={editor.saving} onClick={save}>{editor.saving ? '保存中…' : '保存'}</Button></> : null}
          </div>
        </div> : null}
      </div>}
    </div>
  </section>
}
