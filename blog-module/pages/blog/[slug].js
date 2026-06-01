import db from '../../lib/db'
import Head from 'next/head'

function estimateReadingTime(text){
  if(!text) return 1
  const words = text.split(/\s+/).length
  return Math.max(1, Math.round(words / 200))
}

export default function PostPage({ post, author, tags }){
  if(!post) return <div className="p-6">Not found</div>
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    'headline': post.title,
    'image': post.featured_image ? [post.featured_image] : [],
    'author': { '@type': 'Person', 'name': author?.name || 'Sarga' },
    'datePublished': post.published_at,
    'articleBody': post.content
  }
  return (
    <article className="p-6">
      <Head>
        <title>{post.seo_title || post.title}</title>
        <meta name="description" content={post.seo_description || post.excerpt} />
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      </Head>
      <h1 className="text-3xl font-bold mb-2">{post.title}</h1>
      <div className="text-sm text-gray-600 mb-4">By {author?.name} • {post.reading_time} min read</div>
      {post.featured_image && <img src={post.featured_image} alt={post.title} className="w-full rounded mb-4" />}
      <div dangerouslySetInnerHTML={{ __html: post.content }} />
      <div className="mt-6 text-sm text-gray-600">Tags: {tags.map(t=>t.name).join(', ')}</div>
      {post && (
        <section className="mt-8">
          <h3 className="text-xl font-semibold mb-3">Related articles</h3>
          <div className="grid gap-3 md:grid-cols-3">
            {post.related && post.related.map(r=> (
              <a key={r.id} href={`/blog/${r.slug}`} className="border p-3 rounded">
                <div className="font-semibold">{r.title}</div>
                <div className="text-sm text-gray-600">{r.excerpt}</div>
              </a>
            ))}
          </div>
        </section>
      )}
    </article>
  )
}

export async function getServerSideProps({ params }){
  const r = await db.query('SELECT p.*, a.name as author_name, a.id as author_id FROM posts p LEFT JOIN authors a ON a.id=p.author_id WHERE p.slug=$1 LIMIT 1', [params.slug])
  if (r.rows.length===0) return { props: { post: null } }
  const post = r.rows[0]
  const tagsRes = await db.query('SELECT t.* FROM tags t JOIN posts_tags pt ON pt.tag_id=t.id WHERE pt.post_id=$1', [post.id])
  const tags = tagsRes.rows
  const author = { id: post.author_id, name: post.author_name }
  // fetch related articles via algorithm
  const relRes = await db.query('SELECT p.id,p.title,p.slug,p.excerpt,p.featured_image FROM posts p JOIN posts_tags pt ON pt.post_id=p.id WHERE p.status=\'published\' AND p.id<>$1 AND pt.tag_id IN (SELECT tag_id FROM posts_tags WHERE post_id=$1) GROUP BY p.id ORDER BY count(pt.tag_id) DESC, p.published_at DESC LIMIT 6', [post.id])
  const related = relRes.rows
  return { props: { post, author, tags } }
}
