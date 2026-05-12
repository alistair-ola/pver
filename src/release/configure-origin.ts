export const getGithubPushToken = (
  env: NodeJS.ProcessEnv = process.env
): string | undefined => {
  return env.PVER_GITHUB_TOKEN?.trim() || env.GITHUB_TOKEN?.trim()
}

export const getAuthenticatedGithubRemote = (
  remote_url: string,
  token: string
) => {
  const clean_remote_url = remote_url.trim().replace(/\n/g, "")
  const encoded_token = encodeURIComponent(token)

  if (clean_remote_url.includes("oauth2:")) return clean_remote_url

  const ssh_match = clean_remote_url.match(
    /^git@github\.com:(?<owner>[^/]+)\/(?<repo>.+)$/
  )
  const ssh_url_match = clean_remote_url.match(
    /^ssh:\/\/git@github\.com\/(?<owner>[^/]+)\/(?<repo>.+)$/
  )

  const https_remote_url =
    ssh_match?.groups || ssh_url_match?.groups
      ? `https://github.com/${
          (ssh_match?.groups ?? ssh_url_match?.groups)!.owner
        }/${(ssh_match?.groups ?? ssh_url_match?.groups)!.repo}`
      : clean_remote_url

  return https_remote_url.replace("https://", `https://oauth2:${encoded_token}@`)
}

export const configureOrigin = async (git: any) => {
  const github_token = getGithubPushToken()

  if (github_token) {
    const remote_url = await git.remote(["get-url", "origin"])
    const new_url = getAuthenticatedGithubRemote(remote_url, github_token)

    if (remote_url.trim().replace(/\n/g, "") !== new_url) {
      await git.removeRemote("origin")
      await git.addRemote("origin", new_url)
    }
  }
}
