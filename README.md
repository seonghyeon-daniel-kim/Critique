Classic Critic

리뷰 데이터는 `/api/reviews`를 통해 영구 저장됩니다. 프런트엔드는 그대로 두고, 서버 저장소만 설정하면 배포 후에도 다른 사용자가 같은 리뷰를 보게 됩니다.

지원 저장소

- `Vercel Postgres`
- `Supabase`

우선순위

- `POSTGRES_URL`이 있으면 `Vercel Postgres`를 사용합니다.
- 없고 `SUPABASE_URL`과 `SUPABASE_SERVICE_ROLE_KEY`가 있으면 `Supabase`를 사용합니다.
- 둘 다 없으면 읽기 시 기본 샘플 리뷰만 보이고 저장은 실패합니다.

1. Vercel Postgres 사용

Vercel 프로젝트에 Postgres를 연결한 뒤 아래 환경변수가 자동으로 들어오면 별도 스키마 작업 없이 동작합니다.

- `POSTGRES_URL`

API가 첫 요청 시 `classic_critic_reviews` 테이블을 자동 생성합니다.

2. Supabase 사용

Vercel 환경변수 또는 로컬 `.env`에 아래 값을 넣습니다.

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Supabase에서는 아래 테이블을 먼저 만들어야 합니다.

```sql
create table if not exists public.classic_critic_reviews (
  id text primary key,
  label text not null,
  rating text not null,
  title text not null,
  subtitle text not null,
  youtube_url text not null default '',
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

배포 체크포인트

- `Edit` 모드에서 리뷰를 추가 또는 수정합니다.
- 새로고침 후 내용이 유지되는지 확인합니다.
- 다른 브라우저나 시크릿 창에서 같은 리뷰가 보이는지 확인합니다.
