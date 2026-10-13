module Imports
  module Immich
    # Paces the Immich import on a small server: after each photo added, waits
    # until the background queue has worked through the jobs the photo
    # enqueued (thumbnail, large variant, camera metadata), then collects
    # garbage. Without it, the import enqueues jobs faster than Puma's workers
    # run them, both processes hold several decoded images (a drone photo is
    # 12 to 48 megapixels) and the container is killed for lack of memory.
    #
    # Waits at most `max_wait` seconds per photo, so a stuck queue only slows
    # the import down. Does nothing unless jobs go through Solid Queue.
    class JobBacklog
      MAX_PENDING = 1
      MAX_WAIT = 120
      POLL = 1

      def initialize(max_pending: MAX_PENDING, max_wait: MAX_WAIT, pending: nil, sleeper: ->(seconds) { sleep(seconds) },
                     clock: -> { Process.clock_gettime(Process::CLOCK_MONOTONIC) })
        @max_pending = max_pending
        @max_wait = max_wait
        @pending = pending || method(:solid_queue_pending)
        @sleeper = sleeper
        @clock = clock
      end

      def call
        deadline = @clock.call + @max_wait
        @sleeper.call(POLL) while @pending.call > @max_pending && @clock.call < deadline
        GC.start
      end

      private
        # Jobs waiting for a worker or running.
        def solid_queue_pending
          return 0 unless ActiveJob::Base.queue_adapter_name.to_s == "solid_queue"
          SolidQueue::ReadyExecution.count + SolidQueue::ClaimedExecution.count
        end
    end
  end
end
