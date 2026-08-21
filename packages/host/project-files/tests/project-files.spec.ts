import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { LocalFileSystem } from '@deepseek-ai/dsh-fs-local'
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import { WorkspaceId, type Workspace } from '@deepseek-ai/dsh-workspace'
import ProjectFilesService from '../src/index.ts'

const contexts: Context[] = []

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
})

async function harness(root: string, config: { maxEntries?: number; maxFileBytes?: number } = {}): Promise<ProjectFilesService> {
  const ctx = new Context()
  contexts.push(ctx)
  const workspace = { id: WorkspaceId('workspace-1'), path: root } as Workspace
  ctx.provide('workspaceRegistry', { get: (id: string) => id === workspace.id ? workspace : undefined } as never)
  await ctx.plugin(LocalFileSystem, { cwd: root })
  await ctx.plugin(ProjectFilesService, { maxEntries: 2, maxFileBytes: 32, ...config })
  return ctx.get('projectFiles') as ProjectFilesService
}

describe('ProjectFilesService', () => {
  it('publishes direct list, read, and save methods', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-project-files-'))
    const service = await harness(root)

    expect(remoteMethods(service)).toEqual([
      { method: 'list', invocation: { kind: 'direct' } },
      { method: 'read', invocation: { kind: 'direct' } },
      { method: 'save', invocation: { kind: 'direct' } },
    ])
  })

  it('lists bounded safe children in a deterministic order', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-project-files-'))
    await Promise.all([
      writeFile(join(root, 'z.ts'), 'z'),
      writeFile(join(root, 'a.ts'), 'a'),
      writeFile(join(root, '.env.local'), 'secret'),
      mkdir(join(root, '.git')),
      mkdir(join(root, 'src')),
    ])
    const service = await harness(root)

    await expect(service.list('workspace-1')).resolves.toEqual({
      path: '.',
      entries: [
        { name: 'a.ts', path: 'a.ts', size: 1, type: 'file' },
        { name: 'src', path: 'src', type: 'directory' },
      ],
      truncated: true,
    })
  })

  it('rejects traversal, blocked names, and symlinks leaving the workspace', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-project-files-'))
    const outside = await mkdtemp(join(tmpdir(), 'dsh-project-files-outside-'))
    await writeFile(join(root, '.env'), 'secret')
    await writeFile(join(outside, 'outside.ts'), 'outside')
    await symlink(outside, join(root, 'external'))
    const service = await harness(root)

    await expect(service.read('workspace-1', '../outside.ts')).rejects.toThrow('not allowed')
    await expect(service.read('workspace-1', '.env')).rejects.toThrow('not allowed')
    await expect(service.list('workspace-1', 'external')).rejects.toThrow('escapes the workspace')
  })

  it('reads UTF-8 within the configured byte limit and saves only with its version', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-project-files-'))
    await writeFile(join(root, 'small.ts'), 'const a = 1\n')
    await writeFile(join(root, 'large.ts'), 'x'.repeat(32))
    const service = await harness(root, { maxFileBytes: 16 })

    const initial = await service.read('workspace-1', 'small.ts')
    expect(initial.content).toBe('const a = 1\n')
    await expect(service.read('workspace-1', 'large.ts')).rejects.toThrow()

    const saved = await service.save('workspace-1', 'small.ts', 'const a = 2\r\n', initial.version)
    expect(saved.content).toBe('const a = 2\n')
    await expect(service.save('workspace-1', 'small.ts', 'const a = 3\n', initial.version)).rejects.toThrow()
  })
})
