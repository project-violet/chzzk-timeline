############################
# Lambda IAM role
############################
data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "lambda_exec" {
  name               = "${var.project}-lambda-exec"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

# CloudWatch Logs 기본 권한(관리형 정책)
resource "aws_iam_role_policy_attachment" "lambda_basic_logs" {
  role       = aws_iam_role.lambda_exec.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# S3 Lists
data "aws_iam_policy_document" "lambda_s3_access" {
  statement {
    sid       = "ListInputBucket"
    actions   = ["s3:ListBucket"]
    resources = ["arn:aws:s3:::chzzk-chats-bucket"]

    # (선택) Prefix 제한 걸고 싶으면 Condition 권장
    # event로 prefix를 받더라도, 여기서 허용 범위를 제한 가능
    # condition {
    #   test     = "StringLike"
    #   variable = "s3:prefix"
    #   values = [
    #     "raw/chats/*",
    #     "raw/chats/"
    #   ]
    # }
  }

  statement {
    sid     = "PutOutputObjects"
    actions = ["s3:PutObject"]
    resources = [
      "arn:aws:s3:::chzzk-chats-bucket/*"
    ]
  }
}

resource "aws_iam_role_policy" "lambda_s3_access" {
  name   = "${var.project}-lambda-s3-access"
  role   = aws_iam_role.lambda_exec.id
  policy = data.aws_iam_policy_document.lambda_s3_access.json
}

# Queueing Videos
data "aws_iam_policy_document" "lambda_queueing-videos" {
  # Producer: chatlists.json 읽기
  statement {
    actions   = ["s3:GetObject"]
    resources = ["arn:aws:s3:::chzzk-chats-bucket/chatlists.json"]
  }

  # Producer: SQS enqueue
  statement {
    actions   = ["sqs:SendMessage", "sqs:SendMessageBatch"]
    resources = [aws_sqs_queue.video_jobs.arn]
  }

  # Worker: SQS consume (event source mapping이 필요로 함)
  statement {
    actions = [
      "sqs:ReceiveMessage",
      "sqs:DeleteMessage",
      "sqs:GetQueueAttributes",
      "sqs:ChangeMessageVisibility"
    ]
    resources = [aws_sqs_queue.video_jobs.arn]
  }

  # Worker: 결과 저장
  statement {
    actions   = ["s3:PutObject"]
    resources = ["arn:aws:s3:::chzzk-chats-bucket/test/*"]
  }
}

resource "aws_iam_role_policy" "lambda_queueing-videos" {
  name   = "${var.project}-lambda-queueing-videos"
  role   = aws_iam_role.lambda_exec.id
  policy = data.aws_iam_policy_document.lambda_queueing-videos.json
}
