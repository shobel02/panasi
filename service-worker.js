const CACHE_NAME = 'panasi-v1.0.0';
const urlsToCache = [
    './',
    './index.html',
    './styles.css',
    './app.js',
    './manifest.json',
    // './icons/icon-192x192.png',  // アイコンファイルは一旦コメントアウト
    // './icons/icon-512x512.png',
    'https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@300;400;500;700&display=swap',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css'
];

// Service Worker インストール
self.addEventListener('install', function(event) {
    console.log('Service Worker: Install event');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(function(cache) {
                console.log('Service Worker: Caching files');
                return cache.addAll(urlsToCache);
            })
    );
});

// Service Worker アクティベート
self.addEventListener('activate', function(event) {
    console.log('Service Worker: Activate event');
    event.waitUntil(
        caches.keys().then(function(cacheNames) {
            return Promise.all(
                cacheNames.map(function(cacheName) {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Service Worker: Deleting old cache', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});

// リクエストをキャッシュから提供
self.addEventListener('fetch', function(event) {
    event.respondWith(
        caches.match(event.request)
            .then(function(response) {
                // キャッシュにある場合はキャッシュから返す
                if (response) {
                    return response;
                }
                
                // キャッシュにない場合はネットワークから取得
                return fetch(event.request)
                    .then(function(response) {
                        // レスポンスが有効でない場合はそのまま返す
                        if (!response || response.status !== 200 || response.type !== 'basic') {
                            return response;
                        }
                        
                        // レスポンスをクローンしてキャッシュに保存
                        const responseToCache = response.clone();
                        caches.open(CACHE_NAME)
                            .then(function(cache) {
                                cache.put(event.request, responseToCache);
                            });
                        
                        return response;
                    })
                    .catch(function() {
                        // ネットワークエラーの場合、オフラインページを返すことも可能
                        if (event.request.destination === 'document') {
                            return caches.match('./index.html');
                        }
                    });
            })
    );
});

// バックグラウンド同期（将来の拡張用）
self.addEventListener('sync', function(event) {
    if (event.tag === 'background-sync') {
        console.log('Service Worker: Background sync');
        // バックグラウンドでのデータ同期処理をここに実装
    }
});

// プッシュ通知（将来の拡張用）
self.addEventListener('push', function(event) {
    console.log('Service Worker: Push event received');
    
    const options = {
        body: event.data ? event.data.text() : 'タイマーが完了しました！',
        icon: './icons/icon-192x192.png',
        badge: './icons/icon-72x72.png',
        vibrate: [200, 100, 200],
        tag: 'timer-notification',
        requireInteraction: true,
        actions: [
            {
                action: 'view',
                title: '確認',
                icon: './icons/icon-72x72.png'
            },
            {
                action: 'dismiss',
                title: '閉じる'
            }
        ]
    };
    
    event.waitUntil(
        self.registration.showNotification('Panasi - パン作りタイマー', options)
    );
});

// 通知クリック処理
self.addEventListener('notificationclick', function(event) {
    console.log('Service Worker: Notification click');
    
    event.notification.close();
    
    if (event.action === 'view') {
        event.waitUntil(
            clients.openWindow('./')
        );
    }
});