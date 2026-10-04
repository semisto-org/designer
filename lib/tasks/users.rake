# Staff access (the admin screens: requests from the maps, invoice requests).
# The person must have signed in once, so the account exists.
namespace :users do
  find_user = lambda do |task|
    email = ENV["EMAIL"].to_s.strip.downcase
    abort "Usage: bin/rails #{task.name} EMAIL=someone@example.org" if email.empty?
    User.find_by(email_address: email) || abort("No user with the e-mail #{email}: they must sign in once first.")
  end

  desc "Give a user the Semisto staff role: bin/rails users:admin EMAIL=someone@example.org"
  task admin: :environment do |task|
    user = find_user.call(task)
    user.update!(admin: true)
    puts "#{user.email_address} is now an admin"
  end

  desc "Remove the Semisto staff role: bin/rails users:unadmin EMAIL=someone@example.org"
  task unadmin: :environment do |task|
    user = find_user.call(task)
    user.update!(admin: false)
    puts "#{user.email_address} is no longer an admin"
  end

  desc "List the users with the staff role"
  task admins: :environment do
    User.where(admin: true).order(:email_address).each { |user| puts user.email_address }
  end
end
