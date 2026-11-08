// Prompts shared by e2e/real-cli.mjs and e2e/real-cli-resume.mjs, unique per CLI so the
// session log of each can be found when several run against one server.
export const cliId = () => {
  const id = process.env.E2E_CLI_ID
  if (id === undefined) throw new Error('set E2E_CLI_ID, for example codex')
  return id
}
export const fileFor = (id) => `hello-${id}.txt`
export const writePrompt = (id) =>
  `Create a file named ${fileFor(id)} containing the single word hello. Use your file write tool, once. Then reply with the single word done.`
