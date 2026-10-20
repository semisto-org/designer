#!/usr/bin/env ruby
# CI step of docs/quality/: fails a pull request that adds files in the domain
# of a blocked journey, unless its description carries « Quality: <id> ».
#
#   BASE=origin/main PR_BODY="…" ruby script/quality_gate.rb
require_relative "../lib/quality_gate"

base = ENV.fetch("BASE", "origin/main")
added = `git diff --name-only --diff-filter=A #{base}...HEAD`.split("\n")
abort "git diff against #{base} failed" unless $?.success?

gate = QualityGate.load
problems = gate.check(added:, description: ENV.fetch("PR_BODY", ""))

gate.blocked.each { |journey| puts "Blocked journey: #{journey["id"]} (#{journey["title"]}), see docs/quality/#{journey["month"]}.md" }
if problems.empty?
  puts "No new file in the domain of a blocked journey."
  exit
end

problems.each do |problem|
  puts "::error::« #{problem[:title]} » fails two questions of the point of view: new features in its domain wait until it is fixed (docs/quality/README.md)."
  problem[:files].each { |file| puts "  #{file}" }
  puts "  If this pull request fixes the journey, add the line « Quality: #{problem[:journey]} » to its description."
end
exit 1
