############################
# Package lambda code (local -> zip) + Function
############################
data "archive_file" "lambda_zip" {
  type        = "zip"
  source_dir  = "${path.module}/lambda"
  output_path = "${path.module}/${var.project}.zip"
}

# S3 Lists
resource "aws_lambda_function" "s3-lists" {
  function_name = "${var.project}-s3-lists"
  role          = aws_iam_role.lambda_exec.arn
  runtime       = "python3.12"
  handler       = "s3-lists.handler"

  filename         = data.archive_file.lambda_zip.output_path
  source_code_hash = data.archive_file.lambda_zip.output_base64sha256

  timeout = 900

  tracing_config {
    mode = "Active"
  }
}

# Queueing Videos
resource "aws_lambda_function" "queueing-videos" {
  function_name = "${var.project}-queueing-videos"
  role          = aws_iam_role.lambda_exec.arn
  runtime       = "python3.12"
  handler       = "queueing-videos.handler"

  filename         = data.archive_file.lambda_zip.output_path
  source_code_hash = data.archive_file.lambda_zip.output_base64sha256

  timeout     = 300
  memory_size = 512

  environment {
    variables = {
      RECENT_DAYS = 7
    }
  }

  tracing_config {
    mode = "Active"
  }
}

resource "aws_lambda_event_source_mapping" "extract-chat-from-video_from_sqs" {
  event_source_arn = aws_sqs_queue.video_jobs.arn
  function_name    = aws_lambda_function.extract-chat-from-video.arn
  batch_size       = 1
}

resource "aws_lambda_function" "extract-chat-from-video" {
  function_name = "${var.project}-extract-chat-from-video"
  role          = aws_iam_role.lambda_exec.arn
  runtime       = "python3.12"
  handler       = "extract-chat-from-video.handler"

  filename         = data.archive_file.lambda_zip.output_path
  source_code_hash = data.archive_file.lambda_zip.output_base64sha256

  timeout     = 900
  memory_size = 512

  reserved_concurrent_executions = 10

  environment {
    variables = {
      CHATLOG_BUCKET      = "chzzk-chats-bucket"
      CHATLOG_PREFIX      = "raw/chats/"
      CHZZK_TIMEOUT_SEC   = 30
      CHZZK_MAX_PAGES     = 50000
      CHZZK_PAGE_DELAY_MS = 100
      CHZZK_USER_AGENT    = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/"
    }
  }

  tracing_config {
    mode = "Active"
  }
}
