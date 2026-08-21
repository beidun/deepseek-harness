import type { FsVersion } from '@deepseek-ai/dsh-fs'

/** One direct child shown in the project file tree. */
export interface ProjectFileEntry {
  /** One path segment relative to the listed directory. */
  readonly name: string
  /** Entry category the browser can render. */
  readonly type: 'file' | 'directory'
  /** Complete path relative to the selected Workspace root. */
  readonly path: string
  /** File byte size when the provider supplied it. */
  readonly size?: number
}

/** One bounded direct-directory listing. */
export interface ProjectFileListing {
  /** Directory path relative to the Workspace root. */
  readonly path: string
  /** Alphabetically ordered safe children. */
  readonly entries: readonly ProjectFileEntry[]
  /** More children existed beyond the configured response bound. */
  readonly truncated: boolean
}

/** One editable UTF-8 text file plus the version required to save it. */
export interface ProjectFileContent {
  readonly path: string
  readonly content: string
  readonly version: FsVersion
}
