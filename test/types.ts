import type { FileEntryWithStats, Stats } from "ssh2"

export interface ConnectionOptions {
  port: number
  user: string
  password: string
  host?: string
}

export interface ExecResult {
  stdout: string
  stderr: string
  code: number
}

export interface Check {
  name: string
  status: "pass" | "fail" | "skip"
  detail?: string
  dialect?: string
}

/** Callback results for the subset of ssh2's SFTP API exercised by the harness. */
export interface SftpResults {
  realpath: string
  stat: Stats
  lstat: Stats
  readdir: FileEntryWithStats[]
  readFile: Buffer
  open: Buffer
  fastPut: void
  fastGet: void
  writeFile: void
  write: void
  close: void
  unlink: void
  mkdir: void
  rmdir: void
  rename: void
}
