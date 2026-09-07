# Web Application - T3 Stack

This is the Next.js web application configured with the T3 Stack pattern, featuring full-stack type safety with tRPC, Tailwind CSS for styling, and Drizzle ORM integration.

## 🚀 Quick Start

### Development

```bash
# From the monorepo root
pnpm dev:web

# Or using Nx directly
nx dev web
```

The application will be available at `http://localhost:3000`

### Build

```bash
pnpm build
nx build web
```

### Production

```bash
# Build Docker image
docker build -f apps/web/Dockerfile -t node-monorepo-boilerplate-web .

# Run container
docker run -p 3001:3001 node-monorepo-boilerplate-web
```

## 📚 T3 Stack Overview

This application follows the [T3 Stack](https://create.t3.gg/) pattern, which emphasizes:

- **Type Safety** - End-to-end type safety from frontend to backend
- **Simplicity** - Minimal configuration, maximum productivity
- **Modularity** - Use only what you need

### Stack Components

1. ✅ **Next.js** - React framework with App Router
2. ✅ **TypeScript** - Full type safety
3. ✅ **Tailwind CSS** - Utility-first CSS framework
4. ✅ **tRPC** - End-to-end typesafe APIs
5. ✅ **Drizzle ORM** - Type-safe database access (via `@package/db-core`)

## 🔌 Using tRPC

tRPC provides end-to-end type safety between your frontend and backend. No code generation needed!

### Project Structure

```
src/
├── server/
│   └── api/
│       ├── trpc.ts              # tRPC initialization & context
│       ├── root.ts              # Root router (exports appRouter)
│       └── routers/             # Your tRPC routers
│           ├── _app.ts          # Main app router
│           └── example.ts       # Example router
├── app/
│   └── api/
│       └── trpc/
│           └── [trpc]/
│               └── route.ts     # tRPC API endpoint
└── utils/
    ├── api.ts                   # tRPC client setup
    └── trpc.ts                  # Re-export for convenience
```

### Creating a New Router

1. **Create a router file** in `src/server/api/routers/`:

```typescript
// src/server/api/routers/posts.ts
import { z } from 'zod';
import { createTRPCRouter, publicProcedure } from '../trpc';
import { db } from '@package/db-core';
import { posts } from '@package/db-core/schema';

export const postsRouter = createTRPCRouter({
  // Query procedure (GET-like)
  getAll: publicProcedure.query(async () => {
    return await db.select().from(posts);
  }),

  // Query with input validation
  getById: publicProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
    return await db.select().from(posts).where(eq(posts.id, input.id));
  }),

  // Mutation procedure (POST/PUT/DELETE-like)
  create: publicProcedure
    .input(
      z.object({
        title: z.string().min(1),
        content: z.string().optional()
      })
    )
    .mutation(async ({ input }) => {
      return await db.insert(posts).values(input).returning();
    }),

  // Mutation with database transaction
  update: publicProcedure
    .input(
      z.object({
        id: z.number(),
        title: z.string().min(1).optional(),
        content: z.string().optional()
      })
    )
    .mutation(async ({ input }) => {
      const { id, ...updates } = input;
      return await db.update(posts).set(updates).where(eq(posts.id, id)).returning();
    })
});
```

2. **Add the router to the app router**:

```typescript
// src/server/api/routers/_app.ts
import { createTRPCRouter } from '../trpc';
import { exampleRouter } from './example';
import { postsRouter } from './posts'; // Add your new router

export const appRouter = createTRPCRouter({
  example: exampleRouter,
  posts: postsRouter // Register it here
});
```

3. **Use it in your components**:

```typescript
// src/app/posts/page.tsx
'use client';

import { api } from '~/utils/api';

export default function PostsPage() {
  // Query (automatically refetches on mount, window focus, etc.)
  const { data: posts, isLoading } = api.posts.getAll.useQuery();

  // Mutation
  const createPost = api.posts.create.useMutation({
    onSuccess: () => {
      // Invalidate and refetch posts
      utils.posts.getAll.invalidate();
    },
  });

  const handleCreate = () => {
    createPost.mutate({
      title: 'New Post',
      content: 'Post content',
    });
  };

  if (isLoading) return <div>Loading...</div>;

  return (
    <div>
      <button onClick={handleCreate}>Create Post</button>
      <ul>
        {posts?.map((post) => (
          <li key={post.id}>{post.title}</li>
        ))}
      </ul>
    </div>
  );
}
```

### tRPC Client Usage

#### Queries (Read Operations)

```typescript
'use client';

import { api } from '~/utils/api';

// Basic query
const { data, isLoading, error } = api.posts.getAll.useQuery();

// Query with input
const { data: post } = api.posts.getById.useQuery({ id: 1 });

// Query with options
const { data } = api.posts.getAll.useQuery(undefined, {
  enabled: someCondition, // Conditionally fetch
  refetchOnWindowFocus: false,
  staleTime: 5 * 60 * 1000 // 5 minutes
});
```

#### Mutations (Write Operations)

```typescript
'use client';

import { api } from '~/utils/api';

function MyComponent() {
  const utils = api.useUtils();

  const createPost = api.posts.create.useMutation({
    onSuccess: () => {
      // Invalidate queries to refetch
      utils.posts.getAll.invalidate();
    },
    onError: (error) => {
      console.error('Failed to create post:', error);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createPost.mutate({
      title: 'New Post',
      content: 'Content',
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* form fields */}
      <button type="submit" disabled={createPost.isPending}>
        {createPost.isPending ? 'Creating...' : 'Create Post'}
      </button>
    </form>
  );
}
```

#### Server-Side Usage (Server Components)

```typescript
// src/app/posts/page.tsx (Server Component)
import { api } from '~/utils/api';

export default async function PostsPage() {
  // Use createCaller for server-side calls
  const caller = api.createCaller({
    headers: new Headers(),
  });

  const posts = await caller.posts.getAll();

  return (
    <div>
      {posts.map((post) => (
        <div key={post.id}>{post.title}</div>
      ))}
    </div>
  );
}
```

### Advanced tRPC Features

#### Protected Procedures

```typescript
// src/server/api/trpc.ts
import { TRPCError } from '@trpc/server';

// Create protected procedure
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  // Check authentication
  if (!ctx.session) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  return next({
    ctx: {
      ...ctx,
      session: ctx.session // Now session is guaranteed
    }
  });
});

// Use in router
export const userRouter = createTRPCRouter({
  getProfile: protectedProcedure.query(async ({ ctx }) => {
    // ctx.session is now guaranteed to exist
    return await getUserProfile(ctx.session.userId);
  })
});
```

#### Middleware

```typescript
// Add logging middleware
const loggingMiddleware = t.middleware(async ({ path, type, next }) => {
  const start = Date.now();
  const result = await next();
  const duration = Date.now() - start;
  console.log(`${type} ${path} took ${duration}ms`);
  return result;
});

export const loggedProcedure = publicProcedure.use(loggingMiddleware);
```

## 🎨 Using Tailwind CSS

Tailwind CSS is configured and ready to use. No additional setup needed!

### Basic Usage

```tsx
export default function MyComponent() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <h1 className="text-4xl font-bold text-blue-600">Hello World</h1>
    </div>
  );
}
```

### Custom Configuration

Customize the Tailwind theme in `src/app/global.css` with `@theme` variables:

```typescript
@theme {
  --color-brand-primary: #your-color;
  --color-brand-secondary: #another-color;
}
```

### Using with CSS Modules

You can still use CSS modules alongside Tailwind:

```tsx
import styles from './MyComponent.module.css';

<div className={`${styles.customClass} tailwind-classes`}>Content</div>;
```

## 🗄️ Using Drizzle ORM

Access the database through the shared `@package/db-core` package:

```typescript
// In tRPC procedures
import { db } from '@package/db-core';
import { users, posts } from '@package/db-core/schema';
import { eq } from 'drizzle-orm';

export const usersRouter = createTRPCRouter({
  getAll: publicProcedure.query(async () => {
    return await db.select().from(users);
  }),

  getWithPosts: publicProcedure.input(z.object({ userId: z.number() })).query(async ({ input }) => {
    return await db
      .select()
      .from(users)
      .leftJoin(posts, eq(users.id, posts.userId))
      .where(eq(users.id, input.userId));
  })
});
```

## 📁 Project Structure

```
apps/web/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── api/                # API routes
│   │   │   └── trpc/           # tRPC endpoint
│   │   ├── layout.tsx          # Root layout
│   │   ├── page.tsx            # Home page
│   │   └── global.css          # Global styles + Tailwind
│   ├── components/             # React components
│   │   └── providers.tsx      # React Query + tRPC providers
│   ├── server/                 # Server-side code
│   │   └── api/                # tRPC API
│   │       ├── trpc.ts         # tRPC setup
│   │       ├── root.ts         # Root router
│   │       └── routers/        # tRPC routers
│   └── utils/                  # Utilities
│       ├── api.ts              # tRPC client
│       └── trpc.ts             # Re-export
├── public/                     # Static assets
├── postcss.config.js           # PostCSS configuration
├── next.config.cjs             # Next.js configuration
└── tsconfig.json               # TypeScript configuration
```

## 🔧 TypeScript Path Aliases

Use the `~/*` alias for cleaner imports:

```typescript
// Instead of
import { api } from '../../../utils/api';

// Use
import { api } from '~/utils/api';
```

Configured in `tsconfig.json`:

```json
{
  "compilerOptions": {
    "paths": {
      "~/*": ["./src/*"]
    }
  }
}
```

## 🧪 Development Tips

### React Query Devtools

React Query Devtools are included in development mode. They appear automatically when you run the dev server.

### Type Safety

- All tRPC procedures are fully typed
- Input validation with Zod
- Autocomplete in your IDE
- Catch errors at compile time

### Hot Reload

- Changes to tRPC routers automatically reload
- Component changes hot-reload instantly
- Tailwind classes update without refresh

## 📖 Examples

### Complete CRUD Example

```typescript
// Router: src/server/api/routers/todos.ts
import { z } from 'zod';
import { createTRPCRouter, publicProcedure } from '../trpc';
import { db } from '@package/db-core';
import { todos } from '@package/db-core/schema';
import { eq } from 'drizzle-orm';

export const todosRouter = createTRPCRouter({
  getAll: publicProcedure.query(async () => {
    return await db.select().from(todos);
  }),

  create: publicProcedure
    .input(z.object({ text: z.string().min(1) }))
    .mutation(async ({ input }) => {
      return await db.insert(todos).values(input).returning();
    }),

  update: publicProcedure
    .input(z.object({ id: z.number(), completed: z.boolean() }))
    .mutation(async ({ input }) => {
      return await db
        .update(todos)
        .set({ completed: input.completed })
        .where(eq(todos.id, input.id))
        .returning();
    }),

  delete: publicProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    return await db.delete(todos).where(eq(todos.id, input.id));
  })
});
```

```tsx
// Component: src/app/todos/page.tsx
'use client';

import { api } from '~/utils/api';
import { useState } from 'react';

export default function TodosPage() {
  const [text, setText] = useState('');
  const utils = api.useUtils();

  const { data: todos, isLoading } = api.todos.getAll.useQuery();
  const createTodo = api.todos.create.useMutation({
    onSuccess: () => {
      utils.todos.getAll.invalidate();
      setText('');
    }
  });
  const updateTodo = api.todos.update.useMutation({
    onSuccess: () => {
      utils.todos.getAll.invalidate();
    }
  });
  const deleteTodo = api.todos.delete.useMutation({
    onSuccess: () => {
      utils.todos.getAll.invalidate();
    }
  });

  if (isLoading) return <div>Loading...</div>;

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Todos</h1>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          createTodo.mutate({ text });
        }}
        className="mb-4"
      >
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="border p-2 mr-2"
          placeholder="Add todo..."
        />
        <button
          type="submit"
          disabled={createTodo.isPending}
          className="bg-blue-500 text-white px-4 py-2 rounded"
        >
          Add
        </button>
      </form>

      <ul>
        {todos?.map((todo) => (
          <li key={todo.id} className="flex items-center gap-2 mb-2">
            <input
              type="checkbox"
              checked={todo.completed}
              onChange={() =>
                updateTodo.mutate({
                  id: todo.id,
                  completed: !todo.completed
                })
              }
            />
            <span className={todo.completed ? 'line-through' : ''}>{todo.text}</span>
            <button onClick={() => deleteTodo.mutate({ id: todo.id })} className="text-red-500">
              Delete
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

## 🔗 Resources

- [T3 Stack Documentation](https://create.t3.gg/)
- [tRPC Documentation](https://trpc.io/)
- [Next.js Documentation](https://nextjs.org/docs)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [Drizzle ORM Documentation](https://orm.drizzle.team/)
- [React Query Documentation](https://tanstack.com/query/latest)

## 🐛 Troubleshooting

### tRPC types not updating

If you're not seeing updated types:

1. Restart the TypeScript server in your IDE
2. Check that your router is exported from `_app.ts`
3. Ensure the router is added to the root router

### Tailwind classes not working

1. Check that `global.css` imports Tailwind with `@import 'tailwindcss';`
2. Verify your classes are present in source files scanned by Tailwind
3. Restart the dev server

### Database connection issues

1. Ensure PostgreSQL is running: `docker-compose up -d`
2. Check `DATABASE_URL` environment variable
3. Verify database schema is up to date: `pnpm db:push`

## 📝 Best Practices

1. **Organize routers by feature** - Create separate router files for different features
2. **Use Zod for validation** - Always validate inputs with Zod schemas
3. **Handle errors gracefully** - Use tRPC error handling in mutations
4. **Invalidate queries** - Always invalidate related queries after mutations
5. **Use TypeScript strictly** - Leverage full type safety
6. **Keep components small** - Split large components into smaller ones
7. **Use server components when possible** - For better performance
