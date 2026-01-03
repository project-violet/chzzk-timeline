############################
# S3 bucket
############################
# resource "aws_s3_bucket" "out" {
#   bucket_prefix = "${var.project}-out-"
#   force_destroy = true # 테스트/실습용: 안에 파일 있어도 destroy 되게
# }

# resource "aws_s3_bucket_public_access_block" "out" {
#   bucket                  = aws_s3_bucket.out.id
#   block_public_acls       = true
#   block_public_policy     = true
#   ignore_public_acls      = true
#   restrict_public_buckets = true
# }


