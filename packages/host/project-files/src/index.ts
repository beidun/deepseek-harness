/** Workspace-confined browser file access for the Web UI. */

import { isAbsolute } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { TypertRemoteService, Remote } from '@deepseek-ai/dsh-typert-protocol'
import { FsVersion, type FsTarget } from '@deepseek-ai/dsh-fs'
import { WorkspaceId } from '@deepseek-ai/dsh-workspace'
import type { Workspace } from '@deepseek-ai/dsh-workspace'
import type { ProjectFileContent, ProjectFileEntry, ProjectFileListing } from './types.ts'

export type * from './types.ts'

/** Limits for one browser-originated project-files operation. */
export interface Config {
  /** Maximum UTF-8 bytes decoded by one read. */
  maxFileBytes: number
  /** Maximum child entries retained in one directory result. */
  maxEntries: number
}

/** Names that never cross the project-files boundary. */
function isBlockedName(name: string): boolean {
  return name === '.git' || name.startsWith('.env') || name === 'id_rsa'
}

/** Resolve a caller path only when it remains inside the selected Workspace. */
async function resolveInside(ctx: Context, workspace: Workspace, path: string): Promise<FsTarget> {
  if (path.length === 0 || isAbsolute(path) || path.split(/[\\/]/).some(part => part === '..' || isBlockedName(part))) {
    throw new Error('project file path is not allowed')
  }
  const root = await ctx.fs.resolve(workspace.path)
  const target = await ctx.fs.resolve(path, { cwd: workspace.path })
  if (!ctx.fs.contains(root, target)) throw new Error('project file path escapes the workspace')
  return target
}

/** Project file Remote service; every method is rooted at a registered Workspace. */
export class ProjectFilesService extends TypertRemoteService {
  static inject = ['fs', 'workspaceRegistry']
  static Config: z<Config> = z.object({
    maxFileBytes: z.natural().min(1).default(2 * 1024 * 1024),
    maxEntries: z.natural().min(1).default(1000),
  })

  constructor(ctx: Context, private readonly config: Config) {
    super(ctx, 'projectFiles')
  }

  private workspace(id: string): Workspace {
    const workspace = this.ctx.workspaceRegistry.get(WorkspaceId(id))
    if (workspace === undefined) throw new Error('unknown workspace')
    return workspace
  }

  /** List one safe directory level below a registered Workspace. */
  @Remote('list')
  async list(workspaceId: string, path: string): Promise<ProjectFileListing> {
    const target = await resolveInside(this.ctx, this.workspace(workspaceId), path)
    const entries: ProjectFileEntry[] = []
    let truncated = false
    for (const entry of (await this.ctx.fs.listDir(target)).sort((left, right) => left.name.localeCompare(right.name))) {
      if ((entry.type !== 'file' && entry.type !== 'directory') || isBlockedName(entry.name)) continue
      if (entries.length === this.config.maxEntries) {
        truncated = true
        break
      }
      entries.push({ name: entry.name, type: entry.type, path: path === '.' ? entry.name : `${path}/${entry.name}`, ...(entry.size === undefined ? {} : { size: entry.size }) })
    }
    return { path, entries, truncated }
  }

  /** Read one bounded UTF-8 file and return its current save version. */
  @Remote('read')
  async read(workspaceId: string, path: string): Promise<ProjectFileContent> {
    const target = await resolveInside(this.ctx, this.workspace(workspaceId), path)
    const info = await this.ctx.fs.stat(target)
    if (info?.type !== 'file' || info.version === undefined) throw new Error('project file is not a regular file')
    const bytes = await this.ctx.fs.readBytes(target, undefined, this.config.maxFileBytes)
    const content = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    if (content.includes('\0')) throw new Error('project file is not text')
    return { path, content, version: info.version }
  }

  /** Save text only when the browser still holds the latest observed version. */
  @Remote('save')
  async save(workspaceId: string, path: string, content: string, expectedVersion: string): Promise<ProjectFileContent> {
    const target = await resolveInside(this.ctx, this.workspace(workspaceId), path)
    const outcome = await this.ctx.fs.writeText(target, content, { kind: 'replaceIfVersion', version: FsVersion(expectedVersion) })
    return { path, content: outcome.after, version: outcome.version }
  }

  /** Create a new text file without replacing a concurrent or existing file. */
  @Remote('create')
  async create(workspaceId: string, path: string, content: string): Promise<ProjectFileContent> {
    if (path === '.' || path.endsWith('/') || path.split(/[\\/]/).some(part => part === '' || part === '.')) {
      throw new Error('project file path is not a new file path')
    }
    const target = await resolveInside(this.ctx, this.workspace(workspaceId), path)
    const outcome = await this.ctx.fs.writeText(target, content, { kind: 'createIfAbsent' })
    return { path, content: outcome.after, version: outcome.version }
  }
}

export default ProjectFilesService
