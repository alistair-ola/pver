import assert from "node:assert/strict"
import {
  configureOrigin,
  getAuthenticatedGithubRemote,
  getGithubPushToken,
} from "../src/release/configure-origin"

type GitCall = {
  method: "remote" | "removeRemote" | "addRemote"
  args: unknown[]
}

const createMockGit = (initial_url: string) => {
  let current_url = initial_url
  const calls: GitCall[] = []

  return {
    remote: async (args: string[]) => {
      calls.push({ method: "remote", args })
      return `${current_url}\n`
    },
    removeRemote: async (name: string) => {
      calls.push({ method: "removeRemote", args: [name] })
    },
    addRemote: async (name: string, url: string) => {
      calls.push({ method: "addRemote", args: [name, url] })
      current_url = url
    },
    getCalls: () => calls,
    getCurrentUrl: () => current_url,
  }
}

const withEnv = async (
  env: Record<string, string | undefined>,
  run: () => Promise<void>
) => {
  const original = {
    GITHUB_TOKEN: process.env.GITHUB_TOKEN,
    PVER_GITHUB_TOKEN: process.env.PVER_GITHUB_TOKEN,
  }

  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }

  try {
    await run()
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  }
}

assert.equal(
  getGithubPushToken({
    GITHUB_TOKEN: "github-token",
    PVER_GITHUB_TOKEN: " pver-token ",
  }),
  "pver-token",
  "PVER_GITHUB_TOKEN should take precedence over GITHUB_TOKEN"
)

assert.equal(
  getGithubPushToken({ GITHUB_TOKEN: " github-token " }),
  "github-token",
  "GITHUB_TOKEN should remain the default token"
)

assert.equal(
  getAuthenticatedGithubRemote(
    "git@github.com:tscircuit/pver.git",
    "test-token"
  ),
  "https://oauth2:test-token@github.com/tscircuit/pver.git",
  "SSH remotes should be converted to authenticated HTTPS remotes"
)

assert.equal(
  getAuthenticatedGithubRemote(
    "ssh://git@github.com/tscircuit/pver.git",
    "test-token"
  ),
  "https://oauth2:test-token@github.com/tscircuit/pver.git",
  "ssh:// remotes should be converted to authenticated HTTPS remotes"
)

assert.equal(
  getAuthenticatedGithubRemote(
    "https://github.com/tscircuit/pver.git\n",
    "test-token"
  ),
  "https://oauth2:test-token@github.com/tscircuit/pver.git",
  "HTTPS remotes should receive the token and be trimmed"
)

assert.equal(
  getAuthenticatedGithubRemote(
    "https://github.com/tscircuit/pver.git",
    "token:with@symbols"
  ),
  "https://oauth2:token%3Awith%40symbols@github.com/tscircuit/pver.git",
  "tokens should be URL-encoded before they are added to origin"
)

assert.equal(
  getAuthenticatedGithubRemote(
    "https://oauth2:old-token@github.com/tscircuit/pver.git",
    "test-token"
  ),
  "https://oauth2:old-token@github.com/tscircuit/pver.git",
  "already-authenticated remotes should not be double-authenticated"
)

const runConfigureOriginTests = async () => {
  await withEnv(
    {
      GITHUB_TOKEN: "github-token",
      PVER_GITHUB_TOKEN: " pver-token ",
    },
    async () => {
      const git = createMockGit("git@github.com:tscircuit/pver.git")

      await configureOrigin(git)

      assert.equal(
        git.getCurrentUrl(),
        "https://oauth2:pver-token@github.com/tscircuit/pver.git",
        "configureOrigin should rewrite SSH origin using PVER_GITHUB_TOKEN"
      )
      assert.deepEqual(
        git.getCalls().map((call) => call.method),
        ["remote", "removeRemote", "addRemote"],
        "configureOrigin should only rewrite origin when the URL changes"
      )
    }
  )

  await withEnv(
    {
      GITHUB_TOKEN: undefined,
      PVER_GITHUB_TOKEN: undefined,
    },
    async () => {
      const git = createMockGit("https://github.com/tscircuit/pver.git")

      await configureOrigin(git)

      assert.deepEqual(
        git.getCalls(),
        [],
        "configureOrigin should not inspect or rewrite origin when no token is set"
      )
    }
  )

  await withEnv(
    {
      GITHUB_TOKEN: "new-token",
      PVER_GITHUB_TOKEN: undefined,
    },
    async () => {
      const git = createMockGit(
        "https://oauth2:old-token@github.com/tscircuit/pver.git"
      )

      await configureOrigin(git)

      assert.deepEqual(
        git.getCalls().map((call) => call.method),
        ["remote"],
        "configureOrigin should leave already-authenticated origins alone"
      )
      assert.equal(
        git.getCurrentUrl(),
        "https://oauth2:old-token@github.com/tscircuit/pver.git",
        "configureOrigin should not overwrite an existing authenticated origin"
      )
    }
  )
}

runConfigureOriginTests()
  .then(() => {
    console.log("configure-origin tests passed")
  })
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
