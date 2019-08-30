workflow "Audit and Publish" {
  on = "push"
  resolves = [
    "Publish to npm",
  ]
}

action "Install dependencies" {
  uses = "actions/npm@master"
  args = "ci"
}

action "Audit dependencies" {
  uses = "actions/npm@master"
  args = "audit"
  needs = ["Install dependencies"]
}

action "Tag" {
  uses = "actions/bin/filter@master"
  needs = [
    "Audit dependencies",
  ]
  args = "tag"
}

action "Publish to npm" {
  uses = "actions/npm@master"
  needs = ["Tag"]
  args = "publish --access public"
  secrets = ["NPM_AUTH_TOKEN"]
}
