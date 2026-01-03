############################
# EventBridge Scheduler: every 1 minute
############################

# S3 Lists
resource "aws_scheduler_schedule" "chzzk-chats-s3-lists" {
  name                = "${var.project}-chzzk-chats-s3-lists"
  schedule_expression = "rate(1 hour)"

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = aws_lambda_function.s3-lists.arn
    role_arn = aws_iam_role.scheduler_invoke.arn

    input = jsonencode({
      bucket             = "chzzk-chats-bucket"
      prefix             = "raw/chats/"
      output_bucket_path = "s3://chzzk-chats-bucket/chatlists.json"
    })
  }
}

resource "aws_lambda_permission" "allow_scheduler" {
  statement_id  = "AllowExecutionFromScheduler"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.s3-lists.function_name
  principal     = "scheduler.amazonaws.com"
  source_arn    = aws_scheduler_schedule.chzzk-chats-s3-lists.arn
}


# Queueing Videos
variable "channels_json_url" {
  type    = string
  default = "https://raw.githubusercontent.com/project-violet/chzzk-timeline/main/web/public/channel_with_replays_0.json"
}

resource "aws_scheduler_schedule" "queueing-videos_schedule" {
  name                = "${var.project}-queueing-videos-schedule"
  schedule_expression = "rate(6 hour)"

  flexible_time_window { mode = "OFF" }

  target {
    arn      = aws_lambda_function.queueing-videos.arn
    role_arn = aws_iam_role.scheduler_invoke.arn

    input = jsonencode({
      chatlist_s3_uri   = "s3://chzzk-chats-bucket/chatlists.json"
      channels_json_url = var.channels_json_url
      queue_url         = aws_sqs_queue.video_jobs.id
      output_s3_uri     = "s3://chzzk-chats-bucket/raw/chats/"
    })
  }
}

resource "aws_lambda_permission" "allow_scheduler_queueing-videos" {
  statement_id  = "AllowSchedulerInvokeProducer"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.queueing-videos.function_name
  principal     = "scheduler.amazonaws.com"
  source_arn    = aws_scheduler_schedule.queueing-videos_schedule.arn
}

