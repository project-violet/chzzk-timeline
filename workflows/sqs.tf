resource "aws_sqs_queue" "video_jobs" {
  name                       = "${var.project}-video-jobs"
  visibility_timeout_seconds = 300
}
