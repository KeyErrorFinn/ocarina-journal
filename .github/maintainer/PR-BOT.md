# Set up a PR review bot

Start with a hosted GitHub review app if you want low maintenance. This repository includes `.coderabbit.yaml`
for CodeRabbit, but it does nothing until you install and enable the app. No external service is installed by
these files. The app under `app/` remains local; repository review automation is a separate maintainer service.

## CodeRabbit setup

1. Follow the [official quickstart](https://docs.coderabbit.ai/getting-started/quickstart), sign in with GitHub
   and install the GitHub App. Choose **only selected repositories**, then `KeyErrorFinn/ocarina-journal`.
   Review the access permissions and current plan before completing installation.
2. Push the reviewed `.coderabbit.yaml`, `docs/RULES.md` and `.github/maintainer/MAINTAINER.md` to the default
   branch. The config enables automatic reviews on ready PRs, skips drafts, disables automatic approvals and
   one-off autofix/test-generation controls, and provides the project policy as path-specific instructions.
3. In CodeRabbit's repository settings, confirm automatic reviews are enabled. Keep any automatic merge or
   code-writing integrations disabled. The human maintainer decides what lands; bot verdicts are advice.
4. Open a small test PR after the files are published. Confirm the review appears, names concrete lines and
   follows the project policy. Push a second commit to check incremental reviews. Close or merge it normally.
5. Reuse this approach in other projects by changing the repository selection and the policy paths/instructions.
   Do not copy Ocarina Journal's game-specific rules into unrelated projects.

The [configuration reference](https://docs.coderabbit.ai/reference/configuration) explains the V2 settings used
here. Availability of features and limits depends on the service's current plan. The repository config is not
an access-control boundary; app permissions, branch protection and human review still matter.

## A custom bot like CleanYourTV's

If you need exactly the verdict vocabulary in MAINTAINER.md, a custom review workflow can fetch the PR diff,
send it with the trusted base-branch policy to your chosen model, and post a suggestion. It requires a provider
account, usage budget and separately stored API secret, so no provider-dependent workflow or secret is installed
here. Use this design when implementing it in a dedicated automation change:

- Read the policy and bot code from the trusted base branch, not from the PR's version.
- Use the GitHub API to read changed filenames and diffs; never check out, build or execute contributor code in
  the job holding a model secret or a write token. A `pull_request_target` job is privileged, not a safe sandbox.
- Treat PR descriptions, filenames, patches and comments as untrusted data. They must not override policy,
  request secrets, invoke tools or choose arbitrary API endpoints. Give the model no execution tools.
- Limit input size and cost, use timeouts, validate the response to the six allowed verdicts, and cite concrete
  files/lines. An incomplete diff should produce hold or an explicit partial review, never an approval.
- Use only repository read plus the permission needed to post a PR comment. No branch write, merge or approval
  commands. Never include secrets in prompts or logs. Pin actions to reviewed SHAs.
- Recheck the head SHA before posting so a stale review is not presented as applying to newer changes. Use one
  identifiable comment per PR and update it on subsequent runs to avoid spam.
- Test fork PRs, empty/large diffs, model failure and prompt injection before enabling it on real contributions.

GitHub's [secure use guidance](https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions)
explains untrusted-input and token risks. Keep CI on `pull_request` with read-only permissions. A bot must not
turn a green CI run into a claim that real-game tests, visual review or licensing checks have passed.
