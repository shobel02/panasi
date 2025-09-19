// アプリケーションの主要クラス
class PanasiApp {
    constructor() {
        this.timers = new Map();
        this.timerIdCounter = 0;
        this.voiceRecognition = null;
        this.isListening = false;
        
        // 対話式タイマー設定の状態管理
        this.dialogState = null; // null, 'waiting_bread', 'waiting_process', 'waiting_duration', 'waiting_confirmation'
        this.dialogData = {}; // 対話中のデータを保存
        
        this.initializeElements();
        this.initializeEventListeners();
        this.initializeVoiceRecognition();
        this.loadFromStorage();
        this.startMainLoop();
        
        // ページ読み込み後少し待ってから自動音声認識を開始
        setTimeout(() => {
            if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
                this.startAutoListening();
            }
        }, 2000);
    }

    // DOM要素の初期化
    initializeElements() {
        this.elements = {
            timerForm: document.getElementById('timer-form'),
            breadNameInput: document.getElementById('bread-name'),
            processNameInput: document.getElementById('process-name'),
            durationInput: document.getElementById('duration'),
            timersContainer: document.getElementById('timers-container'),
            voiceBtn: document.getElementById('voice-btn'),
            voiceFeedback: document.getElementById('voice-feedback'),
            voiceRealtime: document.getElementById('voice-realtime'),
            installBtn: document.getElementById('install-btn'),
            settingsToggle: document.getElementById('settings-toggle'),
            settingsPanel: document.getElementById('settings-panel'),
            soundEnabled: document.getElementById('sound-enabled'),
            vibrationEnabled: document.getElementById('vibration-enabled'),
            clearAllBtn: document.getElementById('clear-all-btn'),
            notificationSound: document.getElementById('notification-sound')
        };
    }

    // イベントリスナーの初期化
    initializeEventListeners() {
        // タイマー作成フォーム
        this.elements.timerForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.createTimer();
        });

        // 音声認識ボタン
        this.elements.voiceBtn.addEventListener('click', () => {
            this.toggleVoiceRecognition();
        });

        // ページがフォーカスを失った時は自動認識を停止
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                if (this.isAutoListening) {
                    this.stopAutoListening();
                    this.wasAutoListeningBeforeHidden = true;
                }
            } else {
                // ページが再びフォーカスされた時は自動認識を再開
                if (this.wasAutoListeningBeforeHidden) {
                    setTimeout(() => {
                        this.startAutoListening();
                        this.wasAutoListeningBeforeHidden = false;
                    }, 1000);
                }
            }
        });

        // 設定パネル
        this.elements.settingsToggle.addEventListener('click', () => {
            this.toggleSettingsPanel();
        });

        // 全タイマー削除
        this.elements.clearAllBtn.addEventListener('click', () => {
            this.clearAllTimers();
        });

        // 手動フォーム表示/非表示
        document.getElementById('manual-add-btn').addEventListener('click', () => {
            this.toggleManualForm();
        });

        document.getElementById('close-form-btn').addEventListener('click', () => {
            this.hideManualForm();
        });

        // 設定の保存
        this.elements.soundEnabled.addEventListener('change', () => {
            this.saveSettings();
        });
        
        this.elements.vibrationEnabled.addEventListener('change', () => {
            this.saveSettings();
        });

        // 設定パネル外クリックで閉じる
        document.addEventListener('click', (e) => {
            if (!this.elements.settingsPanel.contains(e.target) && 
                !this.elements.settingsToggle.contains(e.target) &&
                this.elements.settingsPanel.classList.contains('open')) {
                this.elements.settingsPanel.classList.remove('open');
            }
        });

        // ページ離脱時の保存
        window.addEventListener('beforeunload', () => {
            this.saveToStorage();
        });

        // ページフォーカス時の状態更新
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                this.updateAllTimers();
                // ページが再度アクティブになったときに音声認識を再開
                if (this.isAutoListening && !this.isListening) {
                    setTimeout(() => {
                        this.startVoiceRecognition();
                    }, 1000);
                }
            }
        });

        // ウィンドウフォーカス時の音声認識継続
        window.addEventListener('focus', () => {
            if (this.isAutoListening && !this.isListening) {
                setTimeout(() => {
                    this.startVoiceRecognition();
                }, 500);
            }
        });

        // PWA機能の初期化
        this.initializePWA();
    }

    // 音声認識の初期化
    initializeVoiceRecognition() {
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            this.elements.voiceBtn.style.display = 'none';
            console.warn('音声認識がサポートされていません');
            return;
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        this.voiceRecognition = new SpeechRecognition();
        
        // 連続音声認識の設定
        this.voiceRecognition.continuous = true;  // 連続認識を有効
        this.voiceRecognition.interimResults = true;
        this.voiceRecognition.lang = 'ja-JP';
        this.voiceRecognition.maxAlternatives = 3;
        this.voiceRecognition.serviceURI = '';
        
        // 音声認識の詳細設定
        this.silenceTimeout = null;
        this.lastSpeechTime = 0;
        this.autoRestartDelay = 2000; // 2秒後に自動再開（猶予時間拡大）
        this.isAutoListening = false; // 自動音声認識モード
        this.speechEndTimeout = null; // 発話終了検出用タイマー
        
        // より正確な認識のための設定
        if (this.voiceRecognition.grammars) {
            const grammar = '#JSGF V1.0; grammar foods; public <food> = 食パン | クロワッサン | バゲット | メロンパン;';
            const speechRecognitionList = new (window.SpeechGrammarList || window.webkitSpeechGrammarList)();
            speechRecognitionList.addFromString(grammar, 1);
            this.voiceRecognition.grammars = speechRecognitionList;
        }

        this.voiceRecognition.onstart = () => {
            this.isListening = true;
            this.elements.voiceBtn.classList.add('listening');
            // 埋め込み音声認識では状態表示は不要（マイクボタンの色で判断）
            this.elements.voiceFeedback.classList.add('active');
            this.elements.voiceFeedback.innerHTML = '<div style="text-align: center; color: white;">🎤 音声を認識中...</div>';
        };

        this.voiceRecognition.onresult = (event) => {
            let interimTranscript = '';
            let finalTranscript = '';
            let bestAlternative = '';
            
            // 最後の音声を記録（自動再開用）
            this.lastSpeechTime = Date.now();

            for (let i = event.resultIndex; i < event.results.length; i++) {
                if (event.results[i].isFinal) {
                    // 複数の候補から最も確信度の高いものを選択
                    const alternatives = event.results[i];
                    let bestConfidence = 0;
                    
                    for (let j = 0; j < alternatives.length; j++) {
                        if (alternatives[j].confidence > bestConfidence) {
                            bestConfidence = alternatives[j].confidence;
                            bestAlternative = alternatives[j].transcript;
                        }
                    }
                    
                    finalTranscript += bestAlternative || alternatives[0].transcript;
                    console.log('音声認識結果:', {
                        transcript: finalTranscript,
                        confidence: bestConfidence,
                        alternatives: Array.from(alternatives).map(alt => ({text: alt.transcript, confidence: alt.confidence}))
                    });
                } else {
                    interimTranscript += event.results[i][0].transcript;
                    // 無音タイマーをリセット
                    if (this.silenceTimeout) {
                        clearTimeout(this.silenceTimeout);
                    }
                }
            }

            // 認識中は結果を表示
            if (finalTranscript) {
                this.showFinalTranscript(finalTranscript);
                this.processVoiceCommand(finalTranscript.trim());
                
                // 自動モードの場合、コマンド処理後少し待って再開
                if (this.isAutoListening) {
                    setTimeout(() => {
                        this.restartVoiceRecognition();
                    }, 3000); // 3秒待ってから再開（猶予時間拡大）
                }
            } else if (interimTranscript) {
                this.showInterimTranscript(interimTranscript);
                
                // 無音検出タイマーを設定（認識中の場合のみ）
                if (this.silenceTimeout) {
                    clearTimeout(this.silenceTimeout);
                }
                this.silenceTimeout = setTimeout(() => {
                    if (interimTranscript.trim().length > 0) {
                        // 途中で止まった場合は認識を続行
                        console.log('無音検出: 認識継続中 - 猶予時間延長');
                    }
                }, 5000); // 5秒の無音猶予時間
            }
        };

        this.voiceRecognition.onend = () => {
            console.log('音声認識終了');
            this.isListening = false;
            
            // 自動再開モードの場合
            if (this.isAutoListening) {
                setTimeout(() => {
                    if (this.isAutoListening && !this.isListening) {
                        console.log('音声認識を自動再開');
                        this.startVoiceRecognition();
                    }
                }, this.autoRestartDelay);
            } else {
                // 手動モードの場合は通常の終了処理
                this.elements.voiceBtn.classList.remove('listening');
                
                // エラーメッセージを含む全てのフィードバックをクリア
                setTimeout(() => {
                    if (!this.isListening) {
                        this.elements.voiceFeedback.classList.remove('active');
                        this.elements.voiceFeedback.innerHTML = ''; // フィードバックメッセージをクリア
                        this.restoreVoiceExamples();
                    }
                }, 3000);
            }
        };

        this.voiceRecognition.onerror = (event) => {
            console.error('音声認識エラー:', event.error);
            
            // 一般的なエラーは自動で再開（ダイアログによる中断も含む）
            if (event.error === 'no-speech' || event.error === 'network' || event.error === 'aborted' || event.error === 'interrupted') {
                if (this.isAutoListening) {
                    console.log(`エラー "${event.error}" - 自動再開します`);
                    setTimeout(() => {
                        if (this.isAutoListening) {
                            this.startVoiceRecognition();
                        }
                    }, this.autoRestartDelay);
                }
            } else {
                // 深刻なエラーの場合のみ表示（自動消去付き）
                this.showVoiceError(`音声認識エラー: ${this.getErrorMessage(event.error)}`);
                setTimeout(() => {
                    if (!this.isListening) {
                        this.elements.voiceFeedback.innerHTML = '';
                    }
                }, 3000);
                
                if (event.error === 'not-allowed') {
                    this.isAutoListening = false;
                    this.elements.voiceBtn.classList.remove('listening');
                    this.showVoiceError('マイクへのアクセスが必要です');
                }
            }
        };
    }

    // 音声コマンドの処理
    processVoiceCommand(command) {
        console.log('=== 音声コマンド処理開始 ===');
        console.log('元のコマンド:', `"${command}"`);
        
        // 処理状態をリセット
        this.processedCommand = false;
        
        // 🎯 隠しコマンドの処理（最優先・元のコマンドで）
        if (this.processHiddenCommands(command)) {
            console.log('隠しコマンドで処理完了');
            return;
        }
        
        // 音声コマンドの正規化（ひらがな・カタカナ・漢字を統一）
        const normalizedCommand = command.replace(/\s+/g, '');
        console.log('正規化後コマンド:', `"${normalizedCommand}"`);
        
        // 🎯 隠しコマンドの処理（正規化後でも再チェック）
        if (this.processHiddenCommands(normalizedCommand)) {
            console.log('隠しコマンド（正規化後）で処理完了');
            return;
        }
        
        // 🎯 対話式タイマー設定の処理
        if (this.dialogState) {
            console.log('対話モード処理:', { dialogState: this.dialogState, command, normalizedCommand });
            this.processDialogResponse(command, normalizedCommand);
            return;
        }
        
        // 🎯 タイマー設定開始コマンドの処理
        if (this.processTimerSetupCommand(command, normalizedCommand)) {
            console.log('タイマー設定開始コマンドで処理完了');
            return;
        }
        
        // 🎯 タイマー移動コマンドの処理
        if (this.processTimerMoveCommand(command, normalizedCommand)) {
            console.log('タイマー移動コマンドで処理完了');
            return;
        }
        
        // 🎯 残り時間問い合わせコマンドの処理
        if (this.processTimeQueryCommand(command, normalizedCommand)) {
            console.log('残り時間問い合わせコマンドで処理完了');
            return;
        }
        
        // タイマー作成コマンドのパターンを改善
        // パターン1: "食パン一次発酵40分" + オプショナルなスタートワード
        const timerPattern = /^(.+?)(\d+)分(?:スタート|開始|セット|はじめ|はじめて|始め|GO|ゴー)?$/;
        console.log('タイマーパターンチェック:', normalizedCommand, 'パターン:', timerPattern);
        let createMatch = normalizedCommand.match(timerPattern);
        console.log('マッチ結果:', createMatch);
        if (createMatch) {
            const fullText = createMatch[1];
            const duration = parseInt(createMatch[2]);
            console.log('✅ マッチ成功:', { fullText, duration });
            
            // 既存タイマーがあるかチェック（操作コマンドの可能性）
            console.log('🔍 操作コマンドチェック開始');
            if (this.isOperationCommand(fullText)) {
                console.log('⚠️ 操作コマンドとして認識');
                // 操作コマンドとして処理
                this.processOperationCommand(normalizedCommand);
                return;
            }
            console.log('✅ 操作コマンドではない');
            
            // パン名と工程名を分離（元のコマンドから該当部分を抽出）
            console.log('🔍 parseVoiceCommand開始');
            // 元のコマンドから対応する部分を見つける
            const originalFullText = this.findOriginalText(command, fullText);
            console.log('元のテキスト復元:', `"${originalFullText}"`);
            
            try {
                const { breadName, processName } = this.parseVoiceCommand(originalFullText);
                console.log('✅ parseVoiceCommand完了');
                
                console.log('解析結果:', { fullText, originalFullText, breadName, processName, duration });
                
                console.log('🔍 createTimerFromVoice呼び出し開始');
                this.createTimerFromVoice(breadName, processName, duration);
                console.log('✅ createTimerFromVoice完了');
            } catch (error) {
                console.error('❌ parseVoiceCommandまたはcreateTimerFromVoiceでエラー:', error);
                this.showVoiceError('タイマー作成中にエラーが発生しました');
                return;
            }
            this.showVoiceSuccess(`${breadName}の${processName}を${duration}分でスタートしました`);
            this.processedCommand = true;
            return;
        }
        
        // パターン2: 段階的音声認識への対応
        // 「食パン」→「一次発酵」→「40分」のような分割入力
        this.handlePartialCommand(normalizedCommand);
    }

    // 元のコマンドから対応する部分を復元
    findOriginalText(originalCommand, normalizedText) {
        console.log('=== findOriginalText開始 ===');
        console.log('元のコマンド:', `"${originalCommand}"`);
        console.log('正規化テキスト:', `"${normalizedText}"`);
        
        // 数字の部分を特定
        const durationMatch = normalizedText.match(/(\d+)分/);
        if (!durationMatch) {
            console.log('数字が見つからない、元のコマンドをそのまま返す');
            return originalCommand;
        }
        
        const duration = durationMatch[1];
        console.log('検出された時間:', duration);
        
        // 元のコマンドから時間の部分とスタートワードを除去
        const timePattern = new RegExp(`\\s*${duration}\\s*分\\s*(?:スタート|開始|セット|はじめ|はじめて|始め|GO|ゴー)?\\s*$`, 'i');
        const originalWithoutTime = originalCommand.replace(timePattern, '').trim();
        console.log('時間・スタートワード除去:', `"${originalWithoutTime}"`);
        
        console.log('=== findOriginalText終了 ===');
        return originalWithoutTime;
    }

    // パン名でタイマーを検索
    findTimerByBreadName(breadName) {
        for (const timer of this.timers.values()) {
            if (timer.breadName.includes(breadName) || breadName.includes(timer.breadName)) {
                return timer;
            }
        }
        return null;
    }

    // 音声からタイマー作成
    createTimerFromVoice(breadName, processName, duration) {
        console.log('createTimerFromVoice呼び出し:', { breadName, processName, duration });
        this.elements.breadNameInput.value = breadName;
        this.elements.processNameInput.value = processName;
        this.elements.durationInput.value = duration;
        this.createTimer();
    }

    // デバッグ用：音声コマンドのテスト機能
    testVoiceCommand(command) {
        console.log('=== 音声コマンドテスト ===');
        console.log('入力:', command);
        this.processVoiceCommand(command);
    }

    // 🎯 隠しコマンドの処理
    processHiddenCommands(normalizedCommand) {
        console.log('=== 隠しコマンドチェック開始 ===');
        console.log('入力コマンド:', `"${normalizedCommand}"`);
        
        // コマンドを更に正規化（ひらがな・カタカナ混在対応）
        let flexibleCommand = normalizedCommand.toLowerCase();
        flexibleCommand = flexibleCommand.replace(/\s+/g, ''); // 空白削除
        
        // よくある音声認識のゆれを正規化
        flexibleCommand = flexibleCommand.replace(/すべて|全部|ぜんぶ|みんな|みな|オール/g, 'すべて');
        flexibleCommand = flexibleCommand.replace(/タイマー|たいまー|timer/g, 'タイマー');
        flexibleCommand = flexibleCommand.replace(/停止|ストップ|止め|とめ|pause/g, '停止');
        flexibleCommand = flexibleCommand.replace(/終了|削除|消去|クリア|しゅうりょう|さくじょ|clear|delete/g, '終了');
        
        console.log('正規化後コマンド:', `"${flexibleCommand}"`);
        
        // パターンマッチング（より柔軟に）
        const stopPatterns = [
            'タイマーすべて停止', 'すべてタイマー停止', 'タイマー停止すべて',
            'タイマーぜんぶ停止', 'ぜんぶタイマー停止',
            'タイマーみんな停止', 'みんなタイマー停止',
            'すべて停止', 'ぜんぶ停止', 'みんな停止', 'オール停止'
        ];
        
        const endPatterns = [
            'タイマーすべて終了', 'すべてタイマー終了', 'タイマー終了すべて',
            'タイマーぜんぶ終了', 'ぜんぶタイマー終了',
            'タイマーみんな終了', 'みんなタイマー終了',
            'すべて終了', 'ぜんぶ終了', 'みんな終了', 'オール終了',
            'タイマークリア', 'クリアタイマー', 'すべてクリア'
        ];
        
        // 停止コマンドのチェック
        for (const pattern of stopPatterns) {
            if (flexibleCommand.includes(pattern)) {
                console.log(`✅ 停止コマンドにマッチ: "${pattern}"`);
                if (this.pauseAllTimers()) {
                    this.showVoiceSuccess('🛑 すべてのタイマーを停止しました');
                }
                this.processedCommand = true;
                return true;
            }
        }
        
        // 終了コマンドのチェック
        for (const pattern of endPatterns) {
            if (flexibleCommand.includes(pattern)) {
                console.log(`✅ 終了コマンドにマッチ: "${pattern}"`);
                if (this.deleteAllTimers()) {
                    this.showVoiceSuccess('🗑️ すべてのタイマーを終了しました');
                }
                this.processedCommand = true;
                return true;
            }
        }
        
        // 正規表現でのパターンマッチング（さらに柔軟）
        const stopRegex = /(すべて|ぜんぶ|みんな|オール).*(停止|ストップ|とめ)|(停止|ストップ|とめ).*(すべて|ぜんぶ|みんな|オール)|タイマー.*(停止|ストップ|とめ)/;
        const endRegex = /(すべて|ぜんぶ|みんな|オール).*(終了|削除|クリア)|(終了|削除|クリア).*(すべて|ぜんぶ|みんな|オール)|タイマー.*(終了|削除|クリア)/;
        
        if (stopRegex.test(flexibleCommand)) {
            console.log('✅ 停止コマンドに正規表現でマッチ');
            if (this.pauseAllTimers()) {
                this.showVoiceSuccess('🛑 すべてのタイマーを停止しました');
            }
            this.processedCommand = true;
            return true;
        }
        
        if (endRegex.test(flexibleCommand)) {
            console.log('✅ 終了コマンドに正規表現でマッチ');
            if (this.deleteAllTimers()) {
                this.showVoiceSuccess('🗑️ すべてのタイマーを終了しました');
            }
            this.processedCommand = true;
            return true;
        }
        
        console.log('❌ 隠しコマンドにマッチしませんでした');
        console.log('=== 隠しコマンドチェック終了 ===');
        return false;
    }

    // タイマー移動コマンドの処理
    processTimerMoveCommand(originalCommand, normalizedCommand) {
        console.log('=== タイマー移動コマンドチェック開始 ===');
        console.log('元のコマンド:', `"${originalCommand}"`);
        console.log('正規化コマンド:', `"${normalizedCommand}"`);
        
        // 移動コマンドのパターン（柔軟な認識）
        const movePatterns = [
            // 基本パターン
            { pattern: /(.+?)\s*(?:を|の)?\s*(?:上に|一番上に|トップに|先頭に|前に|最初に)\s*(?:持ってきて|移動|表示|出して)?/, name: '移動系' },
            { pattern: /(.+?)\s*(?:を|が)?\s*(?:見たい|確認したい|チェックしたい)/, name: '見たい系' },
            { pattern: /(.+?)\s*(?:を|の)?\s*(?:優先|重要|急ぎ)/, name: '優先系' },
            // より柔軟なパターン（空白を考慮）
            { pattern: /(.+?)(?:上|トップ|先頭|最初)/, name: '位置系' },
            { pattern: /(.+?)(?:移動|表示)/, name: '動作系' },
            // 特定のパターン強化
            { pattern: /^(.+?)見たい$/, name: '見たい（直接）' },
            { pattern: /^(.+?)確認したい$/, name: '確認したい（直接）' },
            // パン名のみでも反応
            { pattern: /^(.+?)(?:パン|ブレッド)$/, name: 'パン名系' }
        ];
        
        // 元のコマンドと正規化コマンドの両方でテスト
        const testCommands = [
            { command: originalCommand, type: '元のコマンド' },
            { command: normalizedCommand, type: '正規化コマンド' }
        ];
        
        for (const testCmd of testCommands) {
            console.log(`--- ${testCmd.type}でテスト: "${testCmd.command}" ---`);
            
            for (const patternObj of movePatterns) {
                console.log(`🔍 パターンテスト [${patternObj.name}]: ${patternObj.pattern}`);
                const match = testCmd.command.match(patternObj.pattern);
                console.log(`   マッチ結果:`, match);
                if (match) {
                    const breadNamePart = match[1].trim();
                    console.log(`✅ 移動パターンにマッチ: "${breadNamePart}"`);
                    
                    // 該当するタイマーを検索
                    const timer = this.findTimerByPartialName(breadNamePart);
                    if (timer) {
                        this.moveTimerToTop(timer);
                        this.showVoiceSuccess(`${timer.breadName}のタイマーを一番上に移動しました`);
                        this.processedCommand = true;
                        console.log('=== タイマー移動コマンドチェック終了（成功）===');
                        return true;
                    } else {
                        console.log(`⚠️ "${breadNamePart}" に該当するタイマーが見つかりません`);
                        this.showVoiceError(`${breadNamePart}のタイマーが見つかりません`);
                        this.processedCommand = true;
                        console.log('=== タイマー移動コマンドチェック終了（タイマーなし）===');
                        return true;
                    }
                }
            }
        }
        
        console.log('❌ タイマー移動コマンドにマッチしませんでした');
        console.log('=== タイマー移動コマンドチェック終了 ===');
        return false;
    }

    // 部分一致でタイマーを検索
    findTimerByPartialName(searchText) {
        console.log(`タイマー検索: "${searchText}"`);
        
        for (const timer of this.timers.values()) {
            console.log(`チェック中: "${timer.breadName}"`);
            
            // 完全一致
            if (timer.breadName === searchText) {
                console.log('✅ 完全一致');
                return timer;
            }
            
            // 部分一致（両方向）
            if (timer.breadName.includes(searchText) || searchText.includes(timer.breadName)) {
                console.log('✅ 部分一致');
                return timer;
            }
            
            // ひらがな・カタカナの違いを吸収
            const normalizedBreadName = timer.breadName.replace(/\s+/g, '');
            const normalizedSearchText = searchText.replace(/\s+/g, '');
            
            if (normalizedBreadName.includes(normalizedSearchText) || normalizedSearchText.includes(normalizedBreadName)) {
                console.log('✅ 正規化後一致');
                return timer;
            }
        }
        
        console.log('❌ 該当するタイマーなし');
        return null;
    }

    // タイマーを一番上に移動
    moveTimerToTop(targetTimer) {
        console.log(`タイマー移動開始: ${targetTimer.breadName}`);
        
        // タイマーコンテナを取得
        const container = this.elements.timersContainer;
        const targetElement = container.querySelector(`[data-timer-id="${targetTimer.id}"]`);
        
        if (targetElement) {
            // 要素を一番上に移動
            container.insertBefore(targetElement, container.firstChild);
            
            // 軽くハイライト効果
            targetElement.style.transform = 'scale(1.02)';
            targetElement.style.transition = 'transform 0.3s ease';
            
            setTimeout(() => {
                targetElement.style.transform = 'scale(1)';
            }, 300);
            
            console.log('✅ タイマー移動完了');
        } else {
            console.log('❌ 対象要素が見つかりません');
        }
    }

    // 残り時間問い合わせコマンドの処理
    processTimeQueryCommand(originalCommand, normalizedCommand) {
        console.log('=== 残り時間問い合わせチェック開始 ===');
        console.log('元のコマンド:', `"${originalCommand}"`);
        
        // 残り時間問い合わせのパターン
        const timeQueryPatterns = [
            // 全体の残り時間
            { pattern: /(?:残り時間|あと何分|あとどれくらい|時間|進捗|状況)(?:は)?(?:どう|どれくらい|いくつ|何分)?(?:\?|？)?/, name: '全体問い合わせ' },
            // 特定タイマーの残り時間
            { pattern: /(.+?)(?:の|は)?(?:残り時間|あと何分|あとどれくらい|時間|進捗|状況)(?:は)?(?:どう|どれくらい|いくつ|何分)?(?:\?|？)?/, name: '特定タイマー問い合わせ' }
        ];
        
        for (const patternObj of timeQueryPatterns) {
            console.log(`🔍 パターンテスト [${patternObj.name}]: ${patternObj.pattern}`);
            
            const match = originalCommand.match(patternObj.pattern);
            console.log(`   マッチ結果:`, match);
            
            if (match) {
                if (patternObj.name === '全体問い合わせ') {
                    // 全タイマーの状況を報告
                    this.reportAllTimersStatus();
                    this.processedCommand = true;
                    console.log('=== 残り時間問い合わせチェック終了（全体）===');
                    return true;
                } else if (patternObj.name === '特定タイマー問い合わせ' && match[1]) {
                    // 特定タイマーの状況を報告
                    const breadNamePart = match[1].trim();
                    console.log(`特定タイマー問い合わせ: "${breadNamePart}"`);
                    this.reportSpecificTimerStatus(breadNamePart);
                    this.processedCommand = true;
                    console.log('=== 残り時間問い合わせチェック終了（特定）===');
                    return true;
                }
            }
        }
        
        console.log('❌ 残り時間問い合わせコマンドにマッチしませんでした');
        console.log('=== 残り時間問い合わせチェック終了 ===');
        return false;
    }

    // 全タイマーの状況を音声で報告
    reportAllTimersStatus() {
        console.log('全タイマー状況報告開始');
        
        if (this.timers.size === 0) {
            this.showVoiceSuccess('現在動作中のタイマーはありません');
            this.speakText('現在動作中のタイマーはありません');
            return;
        }
        
        const runningTimers = Array.from(this.timers.values()).filter(t => t.status === 'running');
        const pausedTimers = Array.from(this.timers.values()).filter(t => t.status === 'paused');
        const completedTimers = Array.from(this.timers.values()).filter(t => t.status === 'completed');
        
        let report = `タイマーは合計${this.timers.size}個です。`;
        
        if (runningTimers.length > 0) {
            report += ` 動作中${runningTimers.length}個。`;
            runningTimers.forEach(timer => {
                const remainingMinutes = Math.ceil(timer.remainingTime / 60);
                report += ` ${timer.breadName}の${timer.processName}、あと${remainingMinutes}分。`;
            });
        }
        
        if (pausedTimers.length > 0) {
            report += ` 一時停止中${pausedTimers.length}個。`;
        }
        
        if (completedTimers.length > 0) {
            report += ` 完了${completedTimers.length}個。`;
        }
        
        console.log('報告内容:', report);
        this.showVoiceSuccess(report);
        this.speakText(report);
    }

    // 特定タイマーの状況を音声で報告
    reportSpecificTimerStatus(breadNamePart) {
        console.log(`特定タイマー状況報告: "${breadNamePart}"`);
        
        const timer = this.findTimerByPartialName(breadNamePart);
        if (!timer) {
            const message = `${breadNamePart}のタイマーが見つかりません`;
            this.showVoiceError(message);
            this.speakText(message);
            return;
        }
        
        let report = `${timer.breadName}の${timer.processName}は`;
        
        if (timer.status === 'completed') {
            report += '完了しています';
        } else if (timer.status === 'paused') {
            const remainingMinutes = Math.ceil(timer.remainingTime / 60);
            report += `一時停止中で、残り${remainingMinutes}分です`;
        } else {
            const remainingMinutes = Math.ceil(timer.remainingTime / 60);
            report += `あと${remainingMinutes}分です`;
        }
        
        console.log('報告内容:', report);
        this.showVoiceSuccess(report);
        this.speakText(report);
    }

    // 現在の音声合成を停止
    stopCurrentSpeech() {
        if ('speechSynthesis' in window) {
            speechSynthesis.cancel();
        }
    }

    // テキストを音声で読み上げ
    speakText(text) {
        if ('speechSynthesis' in window) {
            // 前の読み上げを停止
            this.stopCurrentSpeech();
            
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'ja-JP';
            utterance.rate = 0.9;
            utterance.pitch = 1.0;
            speechSynthesis.speak(utterance);
            console.log('音声読み上げ:', text);
        } else {
            console.log('音声合成がサポートされていません');
        }
    }

    // 全タイマー停止
    pauseAllTimers() {
        let pausedCount = 0;
        let totalCount = 0;
        
        this.timers.forEach(timer => {
            totalCount++;
            if (timer.status === 'running') {
                this.pauseTimer(timer.id);
                pausedCount++;
            }
        });
        
        console.log(`${pausedCount}個のタイマーを停止しました（全${totalCount}個中）`);
        
        if (totalCount === 0) {
            this.showVoiceError('停止するタイマーがありません');
            return false;
        } else if (pausedCount === 0) {
            this.showVoiceError('実行中のタイマーがありません');
            return false;
        }
        return true;
    }

    // 全タイマー削除
    deleteAllTimers() {
        const timerCount = this.timers.size;
        
        if (timerCount === 0) {
            this.showVoiceError('削除するタイマーがありません');
            return false;
        }
        
        this.timers.forEach(timer => timer.stop());
        this.timers.clear();
        this.elements.timersContainer.innerHTML = '';
        this.updateTimersDisplay();
        this.saveToStorage();
        
        console.log(`${timerCount}個のタイマーを削除しました`);
        return true;
    }

    // 音声認識成功メッセージの表示
    showVoiceSuccess(message) {
        this.elements.voiceFeedback.innerHTML = `
            <div style="text-align: center; color: #90ee90; font-weight: 600; font-size: 1.1rem;">
                ✅ ${message}
            </div>
        `;
    }

    // 音声認識エラーメッセージの表示
    showVoiceError(message) {
        this.elements.voiceFeedback.innerHTML = `
            <div style="text-align: center; color: #ff6b6b; font-weight: 600; font-size: 1.1rem;">
                ❌ ${message}
            </div>
        `;
    }

    // 音声コマンドの解析（パン名と工程名を分離）
    parseVoiceCommand(fullText) {
        console.log('=== parseVoiceCommand開始 ===');
        console.log('元のテキスト:', `"${fullText}"`);
        
        // 音声認識でよくある表現を正規化
        let normalizedText = fullText;
        normalizedText = normalizedText.replace(/1次/g, '一次');
        normalizedText = normalizedText.replace(/2次/g, '二次');
        normalizedText = normalizedText.replace(/3次/g, '三次');
        normalizedText = normalizedText.replace(/第1次/g, '一次');
        normalizedText = normalizedText.replace(/第2次/g, '二次');
        normalizedText = normalizedText.replace(/第3次/g, '三次');
        
        if (normalizedText !== fullText) {
            console.log('正規化後のテキスト:', `"${normalizedText}"`);
        }
        
        console.log('解析対象テキスト:', `"${normalizedText}"`);
        
        // 工程キーワード（長いものから順にソート）
        const processKeywords = [
            '一次発酵', '二次発酵', '三次発酵', '最終発酵', 'ベンチタイム',
            '1次発酵', '2次発酵', '3次発酵', '第1次発酵', '第2次発酵', '第3次発酵',
            '発酵', 'こね', 'ねかし', '成形', '焼成', '予熱', 
            '休ませ', 'オーブン', '冷却', '寝かせ', '醗酵'
        ].sort((a, b) => b.length - a.length);
        
        console.log('検索対象工程キーワード:', processKeywords);
        
        let breadName = '';
        let processName = '発酵'; // デフォルト
        let foundKeyword = null;
        
        // 工程キーワードを検索（最も長いマッチを優先）
        for (const keyword of processKeywords) {
            const keywordIndex = normalizedText.indexOf(keyword);
            console.log(`"${keyword}"の検索結果: インデックス ${keywordIndex}`);
            
            if (keywordIndex !== -1) {
                // 工程名の前の部分をパン名とする
                breadName = normalizedText.substring(0, keywordIndex).trim();
                processName = keyword;
                foundKeyword = keyword;
                
                console.log(`✅ マッチした工程: "${keyword}" (位置: ${keywordIndex})`);
                console.log(`   抽出されたパン名: "${breadName}"`);
                break;
            }
        }
        
        // 工程名が見つからない場合
        if (!foundKeyword) {
            console.log('⚠️ 工程キーワードが見つかりません');
            if (fullText.trim()) {
                // 時間情報とスタートワードを除去
                let cleanText = fullText.trim();
                // 時間パターンを除去（数字+分+オプショナルなスタートワード）
                cleanText = cleanText.replace(/\s*\d+\s*分\s*(?:スタート|開始|セット|はじめ|はじめて|始め|GO|ゴー)?\s*$/i, '');
                console.log(`   時間情報除去: "${fullText}" → "${cleanText}"`);
                
                // 元のテキストをスペースで分割
                const parts = cleanText.trim().split(/\s+/);
                console.log(`   分割対象: "${cleanText}" → `, parts);
                
                if (parts.length >= 2) {
                    breadName = parts[0];
                    processName = parts.slice(1).join(' '); // 残りの部分を工程名として結合
                    console.log(`   分割結果 - パン名: "${breadName}", 工程名: "${processName}"`);
                } else {
                    // 1つの単語しかない場合
                    breadName = parts[0];
                    processName = '発酵'; // デフォルト
                    console.log(`   単一単語 - パン名: "${breadName}", 工程名: "${processName}" (デフォルト)`);
                }
            } else {
                breadName = '不明';
                processName = '発酵';
                console.log('   空の入力のため "不明" を設定');
            }
        } else if (!breadName || breadName === '') {
            // 工程名のみの場合
            breadName = '不明';
            console.log('   パン名が空のため "不明" を設定');
        }
        
        // パン名の後処理（余分な文字を除去）
        const originalBreadName = breadName;
        breadName = breadName.replace(/の$/, '').trim();
        if (breadName !== originalBreadName) {
            console.log(`   パン名後処理: "${originalBreadName}" → "${breadName}"`);
        }
        
        if (breadName === '') {
            breadName = '不明';
            console.log('   後処理後に空になったため "不明" を設定');
        }
        
        console.log('🎯 最終解析結果:', { breadName, processName });
        console.log('=== parseVoiceCommand終了 ===');
        return { breadName, processName };
    }

    // 操作コマンドかどうかを判定
    isOperationCommand(fullText) {
        console.log('=== isOperationCommand開始 ===');
        console.log('チェック対象:', `"${fullText}"`);
        
        // 既存のタイマーに関連する操作コマンドかチェック
        const operationKeywords = ['止め', '停止', 'ストップ', '一時停止', '再開', '続行', '完了', '終了', '削除'];
        
        for (const keyword of operationKeywords) {
            if (fullText.includes(keyword)) {
                console.log(`✅ 操作キーワード "${keyword}" を検出`);
                return true;
            }
        }
        
        // 既存のタイマーのパン名が含まれている場合も操作コマンドの可能性
        console.log('既存タイマー数:', this.timers.size);
        for (const timer of this.timers.values()) {
            console.log(`既存タイマーチェック: "${timer.breadName}" が "${fullText}" に含まれるか`);
            if (fullText.includes(timer.breadName)) {
                console.log(`✅ 既存タイマー "${timer.breadName}" を検出`);
                return true;
            }
        }
        
        console.log('❌ 操作コマンドではない');
        console.log('=== isOperationCommand終了 ===');
        return false;
    }

    // 操作コマンドの処理
    processOperationCommand(normalizedCommand) {
        // タイマー停止コマンド
        const stopMatch = normalizedCommand.match(/(.+?)(?:止め|停止|ストップ|一時停止)/);
        if (stopMatch) {
            const breadName = stopMatch[1].trim();
            const timer = this.findTimerByBreadName(breadName);
            if (timer) {
                this.pauseTimer(timer.id);
                this.showVoiceSuccess(`${breadName}のタイマーを停止しました`);
                this.processedCommand = true;
            } else {
                this.showVoiceError(`${breadName}のタイマーが見つかりません`);
                this.processedCommand = true;
            }
            return;
        }

        // タイマー再開コマンド
        const resumeMatch = normalizedCommand.match(/(.+?)(?:再開|続行)/);
        if (resumeMatch) {
            const breadName = resumeMatch[1].trim();
            const timer = this.findTimerByBreadName(breadName);
            if (timer) {
                this.resumeTimer(timer.id);
                this.showVoiceSuccess(`${breadName}のタイマーを再開しました`);
                this.processedCommand = true;
            } else {
                this.showVoiceError(`${breadName}のタイマーが見つかりません`);
                this.processedCommand = true;
            }
            return;
        }

        // タイマー完了コマンド
        const completeMatch = normalizedCommand.match(/(.+?)(?:完了|終了|削除|おわり)/);
        if (completeMatch) {
            const breadName = completeMatch[1].trim();
            const timer = this.findTimerByBreadName(breadName);
            if (timer) {
                this.deleteTimer(timer.id);
                this.showVoiceSuccess(`${breadName}のタイマーを完了しました`);
                this.processedCommand = true;
            } else {
                this.showVoiceError(`${breadName}のタイマーが見つかりません`);
                this.processedCommand = true;
            }
            return;
        }
    }

    // 認識中の文字を表示（リアルタイム）
    showInterimTranscript(interimText) {
        // ヘッダー埋め込みリアルタイム表示
        const realtimeElement = document.getElementById('voice-realtime');
        if (realtimeElement) {
            realtimeElement.classList.add('active');
            realtimeElement.innerHTML = `<span class="interim">${interimText}...</span>`;
        }
        
        // フィードバックヘッダーエリア
        if (this.elements.voiceFeedback) {
            this.elements.voiceFeedback.style.display = 'block';
            this.elements.voiceFeedback.innerHTML = `認識中: ${interimText}...`;
        }
    }

    // 確定した文字を表示
    showFinalTranscript(finalText) {
        const realtimeElement = document.getElementById('voice-realtime');
        if (realtimeElement) {
            realtimeElement.innerHTML = `<span class="final">${finalText}</span>`;
            
            // 2秒後にリアルタイム表示を隠す
            setTimeout(() => {
                realtimeElement.classList.remove('active');
            }, 2000);
        }
        
        // フィードバックヘッダーエリア
        if (this.elements.voiceFeedback) {
            this.elements.voiceFeedback.style.display = 'block';
            this.elements.voiceFeedback.innerHTML = `「${finalText}」を処理中...`;
            
            // 3秒後に隠す
            setTimeout(() => {
                this.elements.voiceFeedback.style.display = 'none';
            }, 3000);
        }
    }



    // 段階的コマンドの処理
    handlePartialCommand(normalizedCommand) {
        // 単純な数字のみ（例：「40」）
        if (/^\d+$/.test(normalizedCommand)) {
            this.showVoiceSuccess(`${normalizedCommand}分を確認しました。パン名と工程名も教えてください`);
            this.processedCommand = true;
            return;
        }
        
        // パン名のみ（例：「食パン」）
        const breadNames = ['食パン', 'クロワッサン', 'バゲット', 'メロンパン', 'ロールパン', 'フランスパン'];
        for (const breadName of breadNames) {
            if (normalizedCommand === breadName) {
                this.showVoiceSuccess(`${breadName}を確認しました。工程名と時間も教えてください`);
                this.processedCommand = true;
                return;
            }
        }
        
        // 工程名のみ（例：「発酵」）
        const processNames = ['一次発酵', '二次発酵', '発酵', 'こね', '成形', '焼成'];
        for (const processName of processNames) {
            if (normalizedCommand === processName) {
                this.showVoiceSuccess(`${processName}を確認しました。パン名と時間も教えてください`);
                this.processedCommand = true;
                return;
            }
        }

        // 既存の操作コマンド処理を試行
        this.processOperationCommand(normalizedCommand);
        
        // 何も該当しない場合
        if (!this.processedCommand) {
            this.showVoiceError(`「${normalizedCommand}」を理解できませんでした。例：「食パン一次発酵40分」`);
            console.log('認識できない音声コマンド:', { command: normalizedCommand });
            
            // エラーメッセージも自動でクリアされるように
            setTimeout(() => {
                if (!this.isListening) {
                    this.elements.voiceFeedback.innerHTML = '';
                }
            }, 5000);
        }
    }

    // エラーメッセージの翻訳
    getErrorMessage(error) {
        const errorMessages = {
            'no-speech': '音声が検出されませんでした',
            'aborted': '音声認識が中断されました',
            'audio-capture': 'マイクにアクセスできません',
            'network': 'ネットワークエラーが発生しました',
            'not-allowed': 'マイクへのアクセスが拒否されました',
            'service-not-allowed': '音声認識サービスが利用できません',
            'bad-grammar': '音声認識の設定にエラーがあります',
            'language-not-supported': '指定された言語がサポートされていません'
        };
        return errorMessages[error] || error;
    }

    // 音声コマンド例の復元
    restoreVoiceExamples() {
        this.elements.voiceFeedback.innerHTML = `
            <div class="voice-examples">
                <p><strong>🎤 音声コマンド</strong></p>
                <div class="voice-command-grid">
                    <div class="voice-command-item">
                        <span class="command">「食パン一次発酵40分スタート」</span>
                        <small>タイマー作成</small>
                    </div>
                    <div class="voice-command-item">
                        <span class="command">「食パン止めて」</span>
                        <small>一時停止</small>
                    </div>
                    <div class="voice-command-item">
                        <span class="command">「食パン再開」</span>
                        <small>再開</small>
                    </div>
                    <div class="voice-command-item">
                        <span class="command">「食パン完了」</span>
                        <small>削除</small>
                    </div>
                </div>
            </div>
        `;
    }

    // 音声認識の手動開始/停止切り替え
    toggleVoiceRecognition() {
        if (this.isAutoListening) {
            this.stopAutoListening();
        } else {
            this.startAutoListening();
        }
    }

    // 自動音声認識の開始
    startAutoListening() {
        this.isAutoListening = true;
        this.elements.voiceBtn.classList.add('listening');
        this.startVoiceRecognition();
    }

    // 自動音声認識の停止
    stopAutoListening() {
        this.isAutoListening = false;
        this.isListening = false;
        this.voiceRecognition.stop();
        this.elements.voiceBtn.classList.remove('listening');
        setTimeout(() => {
            this.elements.voiceFeedback.classList.remove('active');
            this.restoreVoiceExamples();
        }, 1000);
    }

    // 音声認識の実際の開始
    startVoiceRecognition() {
        if (!this.isListening) {
            try {
                this.voiceRecognition.start();
            } catch (error) {
                console.error('音声認識開始エラー:', error);
                if (this.isAutoListening) {
                    setTimeout(() => this.startVoiceRecognition(), 1000);
                }
            }
        }
    }

    // 音声認識の再開
    restartVoiceRecognition() {
        if (this.isAutoListening && !this.isListening) {
            this.startVoiceRecognition();
        }
    }

    // タイマーの作成
    createTimer() {
        console.log('createTimer 呼び出し開始');
        const breadName = this.elements.breadNameInput.value.trim();
        const processName = this.elements.processNameInput.value.trim();
        const duration = parseInt(this.elements.durationInput.value);
        
        console.log('入力値:', { breadName, processName, duration });
        console.log('timersContainer要素:', this.elements.timersContainer);

        if (!breadName || !processName || !duration || duration <= 0) {
            console.log('バリデーションエラー');
            // アラートの代わりに音声認識を妨げない方法でエラー表示
            this.showVoiceError('すべての項目を正しく入力してください');
            
            // エラーメッセージを自動で消去
            setTimeout(() => {
                this.elements.voiceFeedback.innerHTML = '';
            }, 3000);
            return;
        }

        console.log('タイマー作成開始');
        const timer = new Timer(
            this.timerIdCounter++,
            breadName,
            processName,
            duration,
            () => this.onTimerComplete(timer)
        );
        
        console.log('Timer作成完了:', timer);
        this.timers.set(timer.id, timer);
        console.log('timersMapに追加:', this.timers.size);
        console.log('renderTimer呼び出し前');
        this.renderTimer(timer);
        console.log('renderTimer呼び出し後');
        this.updateTimersDisplay();
        console.log('updateTimersDisplay呼び出し後');
        
        // フォームをリセット
        this.elements.timerForm.reset();
        
        this.saveToStorage();
        console.log('createTimer 完了');
    }

    // デバッグ用：強制的にテスト用タイマーを作成
    createTestTimer() {
        console.log('テスト用タイマー作成開始');
        console.log('timersContainer:', this.elements.timersContainer);
        
        if (!this.elements.timersContainer) {
            console.error('ERROR: timersContainer要素が見つかりません');
            return;
        }
        
        const timer = new Timer(
            this.timerIdCounter++,
            'テスト食パン',
            'テスト発酵',
            1, // 1分
            () => this.onTimerComplete(timer)
        );
        
        console.log('テストTimer作成:', timer);
        this.timers.set(timer.id, timer);
        console.log('現在のtimers Map:', this.timers);
        
        // 直接HTML要素を作成して確認
        const testElement = document.createElement('div');
        testElement.style.cssText = 'background: red; color: white; padding: 10px; margin: 10px; border-radius: 5px;';
        testElement.textContent = 'TEST TIMER ELEMENT';
        this.elements.timersContainer.appendChild(testElement);
        
        this.renderTimer(timer);
        this.updateTimersDisplay();
        
        console.log('テスト用タイマー作成完了');
    }

    // タイマーの描画
    renderTimer(timer) {
        const timerElement = document.createElement('div');
        timerElement.className = 'timer-card';
        timerElement.dataset.timerId = timer.id;
        
        timerElement.innerHTML = `
            <div class="timer-header">
                <div class="timer-info">
                    <h3>${timer.breadName}</h3>
                    <p>${timer.processName}</p>
                </div>
                <span class="timer-status ${timer.status}">${this.getStatusText(timer.status)}</span>
            </div>
            <div class="timer-display">
                <div class="timer-time">${this.formatTime(Math.floor(timer.remainingTime))}</div>
                <div class="timer-progress">
                    <div class="timer-progress-bar" style="width: ${timer.getProgressPercentage()}%"></div>
                </div>
                <small>残り時間 | 合計: ${this.formatTime(timer.duration * 60)}</small>
            </div>
            <div class="timer-controls">
                <button class="btn btn-warning pause-btn" onclick="panasiApp.pauseTimer(${timer.id})">
                    <i class="fas fa-pause"></i> 一時停止
                </button>
                <button class="btn btn-secondary resume-btn" onclick="panasiApp.resumeTimer(${timer.id})" style="display: none;">
                    <i class="fas fa-play"></i> 再開
                </button>
                <button class="btn btn-primary reset-btn" onclick="panasiApp.resetTimer(${timer.id})">
                    <i class="fas fa-redo"></i> リセット
                </button>
                <button class="btn btn-danger delete-btn" onclick="panasiApp.deleteTimer(${timer.id})">
                    <i class="fas fa-trash"></i> 完了
                </button>
            </div>
        `;
        
        this.elements.timersContainer.appendChild(timerElement);
        this.updateTimerElement(timer);
    }

    // タイマー要素の更新
    updateTimerElement(timer) {
        const timerElement = document.querySelector(`[data-timer-id="${timer.id}"]`);
        if (!timerElement) return;

        const timeDisplay = timerElement.querySelector('.timer-time');
        const progressBar = timerElement.querySelector('.timer-progress-bar');
        const statusElement = timerElement.querySelector('.timer-status');
        const pauseBtn = timerElement.querySelector('.pause-btn');
        const resumeBtn = timerElement.querySelector('.resume-btn');

        // 時間表示更新
        timeDisplay.textContent = this.formatTime(Math.floor(timer.remainingTime));
        
        // プログレスバー更新
        progressBar.style.width = `${timer.getProgressPercentage()}%`;
        
        // ステータス更新
        statusElement.textContent = this.getStatusText(timer.status);
        statusElement.className = `timer-status ${timer.status}`;
        
        // 1分切った場合の強調表示
        const isUrgent = timer.status === 'running' && timer.remainingTime <= 60 && timer.remainingTime > 0;
        
        if (isUrgent) {
            timerElement.className = `timer-card ${timer.status} urgent`;
            timeDisplay.classList.add('urgent');
            
            // 10秒おきにアラーム音を鳴らす（1分切ってから）
            if (timer.remainingTime % 10 === 0 && timer.remainingTime <= 60) {
                this.playWarningSound();
            }
        } else {
            timerElement.className = `timer-card ${timer.status}`;
            timeDisplay.classList.remove('urgent');
        }
        
        // タイマー完了時のアラーム
        if (timer.status === 'completed' && timer.remainingTime === 0) {
            this.playCompletionAlarm(timer);
        }
        
        // ボタン表示切り替え
        if (timer.status === 'paused') {
            pauseBtn.style.display = 'none';
            resumeBtn.style.display = 'inline-flex';
        } else {
            pauseBtn.style.display = 'inline-flex';
            resumeBtn.style.display = 'none';
        }
    }

    // 時間のフォーマット (HH:MM:SS形式 = 時:分:秒)
    formatTime(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    // ステータステキストの取得
    getStatusText(status) {
        const statusTexts = {
            'running': '実行中',
            'paused': '一時停止',
            'completed': '完了'
        };
        return statusTexts[status] || status;
    }

    // タイマー操作メソッド
    pauseTimer(id) {
        const timer = this.timers.get(id);
        if (timer) {
            timer.pause();
            this.updateTimerElement(timer);
            this.saveToStorage();
        }
    }

    resumeTimer(id) {
        const timer = this.timers.get(id);
        if (timer) {
            timer.resume();
            this.updateTimerElement(timer);
            this.saveToStorage();
        }
    }

    resetTimer(id) {
        const timer = this.timers.get(id);
        if (timer) {
            timer.reset();
            this.updateTimerElement(timer);
            this.saveToStorage();
        }
    }

    deleteTimer(id) {
        const timer = this.timers.get(id);
        if (timer) {
            timer.stop();
            this.timers.delete(id);
            const timerElement = document.querySelector(`[data-timer-id="${id}"]`);
            if (timerElement) {
                timerElement.remove();
            }
            this.updateTimersDisplay();
            this.saveToStorage();
        }
    }

    // 全タイマー削除
    clearAllTimers() {
        if (this.timers.size === 0) return;
        
        // 確認なしで全削除（音声認識を妨げないため）
        this.timers.forEach(timer => timer.stop());
        this.timers.clear();
        this.elements.timersContainer.innerHTML = '';
        this.updateTimersDisplay();
        this.saveToStorage();
        this.showVoiceSuccess('すべてのタイマーを削除しました');
    }

    // タイマー完了時の処理
    onTimerComplete(timer) {
        console.log('タイマー完了:', timer.breadName, timer.processName);
        
        // 通知表示
        this.showNotification(timer);
        
        // 音声通知
        if (this.elements.soundEnabled.checked) {
            this.playNotificationSound();
        }
        
        // バイブレーション
        if (this.elements.vibrationEnabled.checked && 'vibrate' in navigator) {
            navigator.vibrate([300, 100, 300, 100, 300]);
        }
        
        // UI更新
        this.updateTimerElement(timer);
        this.saveToStorage();
    }

    // 通知の表示
    showNotification(timer) {
        const title = 'Panasi - タイマー完了';
        const message = `${timer.breadName}の${timer.processName}が完了しました！`;
        
        // ブラウザ通知
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(title, {
                body: message,
                icon: './icons/icon-192x192.png',
                tag: `timer-${timer.id}`,
                requireInteraction: true
            });
        } else if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission().then(permission => {
                if (permission === 'granted') {
                    new Notification(title, {
                        body: message,
                        icon: './icons/icon-192x192.png'
                    });
                }
            });
        }
        
        // アプリ内通知
        this.showInAppNotification(message);
    }

    // アプリ内通知
    showInAppNotification(message) {
        const notification = document.createElement('div');
        notification.className = 'in-app-notification';
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: var(--secondary-color);
            color: white;
            padding: 1rem 1.5rem;
            border-radius: 8px;
            box-shadow: var(--shadow-hover);
            z-index: 10000;
            animation: slideIn 0.3s ease-out;
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease-in';
            setTimeout(() => notification.remove(), 300);
        }, 5000);
    }

    // 通知音の再生
    playNotificationSound() {
        this.elements.notificationSound.currentTime = 0;
        this.elements.notificationSound.play().catch(e => {
            console.warn('通知音の再生に失敗:', e);
        });
    }

    // 警告音の再生（1分切った場合）
    playWarningSound() {
        if (!this.elements.soundEnabled.checked) return;
        
        // Web Audio APIで警告音を生成
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
            oscillator.type = 'sine';
            
            gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
            
            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.3);
        } catch (e) {
            console.warn('警告音の再生に失敗:', e);
        }
    }

    // 完了アラーム音の再生
    playCompletionAlarm(timer) {
        if (!this.elements.soundEnabled.checked) return;
        
        // より目立つ完了音を3回連続で、全体を3回繰り返す
        let repeatCount = 0;
        const playAlarmSequence = () => {
            if (repeatCount >= 3) return;
            
            let count = 0;
            const playAlarm = () => {
                if (count >= 3) {
                    repeatCount++;
                    if (repeatCount < 3) {
                        setTimeout(playAlarmSequence, 1500); // 1.5秒休憩後に次のシーケンス
                    }
                    return;
                }
                
                try {
                    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                    const oscillator = audioContext.createOscillator();
                    const gainNode = audioContext.createGain();
                    
                    oscillator.connect(gainNode);
                    gainNode.connect(audioContext.destination);
                    
                    oscillator.frequency.setValueAtTime(1000, audioContext.currentTime);
                    oscillator.type = 'square';
                    
                    gainNode.gain.setValueAtTime(0.5, audioContext.currentTime);
                    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
                    
                    oscillator.start(audioContext.currentTime);
                    oscillator.stop(audioContext.currentTime + 0.5);
                    
                    count++;
                    if (count < 3) {
                        setTimeout(playAlarm, 600);
                    } else {
                        repeatCount++;
                        if (repeatCount < 3) {
                            setTimeout(playAlarmSequence, 1500);
                        }
                    }
                } catch (e) {
                    console.warn('完了アラーム音の再生に失敗:', e);
                }
            };
            
            playAlarm();
        };
        
        playAlarmSequence();
        
        // 既存の通知音も再生
        this.playNotificationSound();
        
        console.log(`🔔 ${timer.breadName}の${timer.processName}が完了しました！`);
    }

    // タイマー表示の更新
    updateTimersDisplay() {
        const noTimersElement = this.elements.timersContainer.querySelector('.no-timers');
        
        if (this.timers.size === 0) {
            if (!noTimersElement) {
                this.elements.timersContainer.innerHTML = `
                    <div class="no-timers">
                        <i class="fas fa-clock"></i>
                        <p>タイマーが設定されていません</p>
                    </div>
                `;
            }
        } else {
            if (noTimersElement) {
                noTimersElement.remove();
            }
            
            // タイマーの並び替え（完了したタイマーを下に移動）
            this.sortTimerElements();
            
            // 古い完了タイマーのクリーンアップ
            this.cleanupOldCompletedTimers();
        }
    }

    // タイマー要素の並び替え（完了したタイマーを下に）
    sortTimerElements() {
        const timerElements = Array.from(this.elements.timersContainer.querySelectorAll('.timer-card'));
        
        // タイマー要素をステータス順でソート
        timerElements.sort((a, b) => {
            const timerIdA = parseInt(a.dataset.timerId);
            const timerIdB = parseInt(b.dataset.timerId);
            const timerA = this.timers.get(timerIdA);
            const timerB = this.timers.get(timerIdB);
            
            if (!timerA || !timerB) return 0;
            
            // 完了状態の比較（未完了が上、完了が下）
            if (timerA.status === 'completed' && timerB.status !== 'completed') return 1;
            if (timerA.status !== 'completed' && timerB.status === 'completed') return -1;
            
            // 同じ状態の場合は作成時間順
            return timerA.id - timerB.id;
        });
        
        // 並び替えた順序で要素を再配置
        timerElements.forEach(element => {
            this.elements.timersContainer.appendChild(element);
        });
    }

    // 古い完了タイマーのクリーンアップ（10分後に自動削除）
    cleanupOldCompletedTimers() {
        const cutoffTime = Date.now() - (10 * 60 * 1000); // 10分前
        const timersToDelete = [];
        
        this.timers.forEach(timer => {
            if (timer.status === 'completed' && 
                timer.completedTime && 
                timer.completedTime < cutoffTime) {
                timersToDelete.push(timer.id);
            }
        });
        
        timersToDelete.forEach(timerId => {
            console.log(`古い完了タイマーを自動削除: ${timerId}`);
            this.deleteTimer(timerId);
        });
    }

    // 全タイマーの更新
    updateAllTimers() {
        this.timers.forEach(timer => {
            this.updateTimerElement(timer);
        });
    }

    // 設定パネルの切り替え
    toggleSettingsPanel() {
        this.elements.settingsPanel.classList.toggle('open');
    }

    // 手動フォームの表示/非表示
    toggleManualForm() {
        const formSection = document.getElementById('manual-form-section');
        if (formSection.style.display === 'none' || !formSection.style.display) {
            this.showManualForm();
        } else {
            this.hideManualForm();
        }
    }

    showManualForm() {
        const formSection = document.getElementById('manual-form-section');
        formSection.style.display = 'block';
        formSection.scrollIntoView({ behavior: 'smooth' });
    }

    hideManualForm() {
        const formSection = document.getElementById('manual-form-section');
        formSection.style.display = 'none';
        this.elements.timerForm.reset();
    }

    // 設定の保存
    saveSettings() {
        const settings = {
            soundEnabled: this.elements.soundEnabled.checked,
            vibrationEnabled: this.elements.vibrationEnabled.checked
        };
        localStorage.setItem('panasi-settings', JSON.stringify(settings));
    }

    // 設定の読み込み
    loadSettings() {
        const settings = JSON.parse(localStorage.getItem('panasi-settings') || '{}');
        
        if (settings.soundEnabled !== undefined) {
            this.elements.soundEnabled.checked = settings.soundEnabled;
        }
        if (settings.vibrationEnabled !== undefined) {
            this.elements.vibrationEnabled.checked = settings.vibrationEnabled;
        }
    }

    // データの保存
    saveToStorage() {
        const data = {
            timers: Array.from(this.timers.values()).map(timer => timer.serialize()),
            timerIdCounter: this.timerIdCounter
        };
        localStorage.setItem('panasi-data', JSON.stringify(data));
    }

    // データの読み込み
    loadFromStorage() {
        this.loadSettings();
        
        const data = JSON.parse(localStorage.getItem('panasi-data') || '{}');
        
        if (data.timers) {
            data.timers.forEach(timerData => {
                const timer = Timer.deserialize(timerData, () => this.onTimerComplete(timer));
                this.timers.set(timer.id, timer);
                this.renderTimer(timer);
            });
        }
        
        if (data.timerIdCounter) {
            this.timerIdCounter = data.timerIdCounter;
        }
        
        this.updateTimersDisplay();
    }

    // メインループ（1秒ごとに実行）
    startMainLoop() {
        setInterval(() => {
            let hasChanges = false;
            
            this.timers.forEach(timer => {
                if (timer.status === 'running') {
                    timer.tick();
                    this.updateTimerElement(timer);
                    hasChanges = true;
                }
            });
            
            if (hasChanges) {
                this.saveToStorage();
            }
        }, 1000);
        
        // 1分ごとにクリーンアップとソートを実行
        setInterval(() => {
            if (this.timers.size > 0) {
                this.updateTimersDisplay();
            }
        }, 60000);
    }

    // 🎯 タイマー設定開始コマンドの処理
    processTimerSetupCommand(originalCommand, normalizedCommand) {
        const setupPatterns = [
            /タイマー設定/,
            /タイマーセット/,
            /タイマー作成/,  
            /新しいタイマー/,
            /タイマー追加/,
            /タイマーをセット/,
            /タイマーを設定/
        ];

        const isSetupCommand = setupPatterns.some(pattern => 
            pattern.test(originalCommand) || pattern.test(normalizedCommand)
        );

        if (isSetupCommand) {
            this.startDialogTimer();
            return true;
        }
        return false;
    }

    // 対話式タイマー設定を開始
    startDialogTimer() {
        this.dialogState = 'waiting_bread';
        this.dialogData = {};
        
        this.showVoiceSuccess('タイマー設定を開始します');
        this.speakText('どのパンのタイマーを設定しますか？例：食パン、メロンパン、クロワッサンなど');
        
        // フィードバック表示
        if (this.elements.voiceFeedback) {
            this.elements.voiceFeedback.style.display = 'block';
            this.elements.voiceFeedback.innerHTML = 'パン名を教えてください（例：食パン、メロンパン）';
        }
    }

    // 対話中の応答を処理
    processDialogResponse(originalCommand, normalizedCommand) {
        console.log(`対話状態: ${this.dialogState}, 応答: "${originalCommand}"`);

        switch (this.dialogState) {
            case 'waiting_bread':
                // 前の音声を停止
                this.stopCurrentSpeech();
                
                this.dialogData.breadName = originalCommand;
                this.dialogState = 'waiting_process';
                
                this.showVoiceSuccess(`${originalCommand}ですね`);
                this.speakText('どのような工程ですか？例：一次発酵、二次発酵、焼き上げなど');
                
                if (this.elements.voiceFeedback) {
                    this.elements.voiceFeedback.innerHTML = '工程名を教えてください（例：一次発酵、焼き上げ）';
                }
                break;

            case 'waiting_process':
                // 前の音声を停止
                this.stopCurrentSpeech();
                
                this.dialogData.processName = originalCommand;
                this.dialogState = 'waiting_duration';
                
                this.showVoiceSuccess(`${originalCommand}ですね`);
                this.speakText('何分のタイマーですか？数字のみ答えてください');
                
                if (this.elements.voiceFeedback) {
                    this.elements.voiceFeedback.innerHTML = '時間を教えてください（例：40、90）';
                }
                break;

            case 'waiting_duration':
                // 前の音声を停止
                this.stopCurrentSpeech();
                
                const durationMatch = normalizedCommand.match(/(\d+)/);
                if (durationMatch) {
                    this.dialogData.duration = parseInt(durationMatch[1]);
                    this.dialogState = 'waiting_confirmation';
                    
                    const confirmMessage = `${this.dialogData.breadName}の${this.dialogData.processName}、${this.dialogData.duration}分のタイマーを設定します。よろしいですか？`;
                    this.showVoiceSuccess(confirmMessage);
                    this.speakText('よろしければ「はい」または「OK」と答えてください。やり直す場合は「いいえ」と答えてください');
                    
                    if (this.elements.voiceFeedback) {
                        this.elements.voiceFeedback.innerHTML = confirmMessage + '<br>「はい」「OK」で決定、「いいえ」でキャンセル';
                    }
                } else {
                    this.speakText('数字が聞き取れませんでした。もう一度時間を数字で答えてください');
                }
                break;

            case 'waiting_confirmation':
                console.log('確認応答処理:', { originalCommand, normalizedCommand });
                console.log('肯定判定:', this.isPositiveResponse(originalCommand, normalizedCommand));
                console.log('否定判定:', this.isNegativeResponse(originalCommand, normalizedCommand));
                
                if (this.isPositiveResponse(originalCommand, normalizedCommand)) {
                    console.log('タイマー作成を実行します');
                    // タイマー作成実行
                    this.createTimerFromDialog();
                } else if (this.isNegativeResponse(originalCommand, normalizedCommand)) {
                    console.log('タイマー設定をキャンセルします');
                    // キャンセル
                    this.cancelDialog();
                } else {
                    console.log('応答が理解できませんでした:', originalCommand);
                    this.speakText('「はい」「OK」で決定、「いいえ」「キャンセル」でやり直しになります');
                }
                break;
        }
    }

    // 肯定的な応答かチェック
    isPositiveResponse(originalCommand, normalizedCommand) {
        const positivePatterns = [
            /はい/i, /ハイ/i, /イエス/i, /yes/i, /Yes/i, /YES/i,
            /OK/i, /ok/i, /オーケー/i, /おーけー/i, /オッケー/i,
            /いいです/i, /良いです/i, /大丈夫/i, /よろしい/i, /宜しい/i,
            /了解/i, /決定/i, /セット/i, /set/i, /確定/i, 
            /^はい$/i, /^ハイ$/i, /^yes$/i, /^ok$/i
        ];
        
        console.log('肯定判定チェック:', originalCommand, '→', positivePatterns.some(pattern => 
            pattern.test(originalCommand) || pattern.test(normalizedCommand)
        ));
        
        return positivePatterns.some(pattern => 
            pattern.test(originalCommand) || pattern.test(normalizedCommand)
        );
    }

    // 否定的な応答かチェック
    isNegativeResponse(originalCommand, normalizedCommand) {
        const negativePatterns = [
            /いいえ/i, /ノー/i, /no/i, /だめ/i, /やめ/i, /キャンセル/i,
            /取り消し/i, /やり直し/i, /違う/i, /ちがう/i
        ];
        
        return negativePatterns.some(pattern => 
            pattern.test(originalCommand) || pattern.test(normalizedCommand)
        );
    }

    // 対話からタイマーを作成
    createTimerFromDialog() {
        try {
            const timer = new Timer(
                this.timerIdCounter++,
                this.dialogData.breadName,
                this.dialogData.processName,
                this.dialogData.duration,
                (completedTimer) => this.handleTimerComplete(completedTimer)
            );
            
            this.timers.set(timer.id, timer);
            this.updateTimersDisplay();
            this.saveToStorage();
            
            const successMessage = `${this.dialogData.breadName}の${this.dialogData.processName}、${this.dialogData.duration}分のタイマーを開始しました！`;
            this.showVoiceSuccess(successMessage);
            this.speakText(successMessage);
            
            console.log('対話式タイマー作成成功:', timer);
        } catch (error) {
            console.error('対話式タイマー作成エラー:', error);
            this.showVoiceError('タイマーの作成に失敗しました');
        } finally {
            this.resetDialog();
        }
    }

    // 対話をキャンセル
    cancelDialog() {
        this.showVoiceSuccess('タイマー設定をキャンセルしました');
        this.speakText('タイマー設定をキャンセルしました。また必要な時に「タイマー設定」と言ってください');
        this.resetDialog();
    }

    // 対話状態をリセット
    resetDialog() {
        // 音声合成を停止
        this.stopCurrentSpeech();
        
        this.dialogState = null;
        this.dialogData = {};
        
        if (this.elements.voiceFeedback) {
            setTimeout(() => {
                this.elements.voiceFeedback.style.display = 'none';
            }, 8000); // 3秒から8秒に延長
        }
    }

    // PWA機能の初期化
    initializePWA() {
        let deferredPrompt;

        // PWAインストール可能イベント
        window.addEventListener('beforeinstallprompt', (e) => {
            console.log('PWA: Install prompt available');
            e.preventDefault();
            deferredPrompt = e;
            
            // インストールボタンを表示
            if (this.elements.installBtn) {
                this.elements.installBtn.style.display = 'flex';
            }
        });

        // インストールボタンクリック
        if (this.elements.installBtn) {
            this.elements.installBtn.addEventListener('click', async () => {
                if (!deferredPrompt) {
                    console.log('PWA: No install prompt available');
                    return;
                }

                // インストールプロンプト表示
                deferredPrompt.prompt();
                
                // ユーザーの選択を待機
                const { outcome } = await deferredPrompt.userChoice;
                console.log(`PWA: User choice: ${outcome}`);
                
                if (outcome === 'accepted') {
                    console.log('PWA: User accepted the install prompt');
                } else {
                    console.log('PWA: User dismissed the install prompt');
                }
                
                // プロンプトをクリア
                deferredPrompt = null;
                this.elements.installBtn.style.display = 'none';
            });
        }

        // PWAがインストール済みかチェック
        window.addEventListener('appinstalled', () => {
            console.log('PWA: App was installed');
            if (this.elements.installBtn) {
                this.elements.installBtn.style.display = 'none';
            }
            
            // インストール完了通知
            this.showVoiceSuccess('Panasiアプリがインストールされました！');
        });

        // Service Worker登録
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('./service-worker.js')
                .then((registration) => {
                    console.log('PWA: Service Worker registered successfully:', registration.scope);
                    
                    // Service Workerの更新チェック
                    registration.addEventListener('updatefound', () => {
                        const newWorker = registration.installing;
                        if (newWorker) {
                            newWorker.addEventListener('statechange', () => {
                                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                    console.log('PWA: New version available');
                                    this.showUpdatePrompt();
                                }
                            });
                        }
                    });
                })
                .catch((error) => {
                    console.log('PWA: Service Worker registration failed:', error);
                });
        }

        // PWAが既にインストール済みかチェック（displayMode）
        if (window.matchMedia('(display-mode: standalone)').matches || 
            window.navigator.standalone === true) {
            console.log('PWA: Running in standalone mode');
            if (this.elements.installBtn) {
                this.elements.installBtn.style.display = 'none';
            }
        }
    }

    // アプリ更新プロンプト
    showUpdatePrompt() {
        const updateMessage = 'Panasiの新しいバージョンが利用可能です。更新しますか？';
        
        // フィードバック表示
        if (this.elements.voiceFeedback) {
            this.elements.voiceFeedback.style.display = 'block';
            this.elements.voiceFeedback.innerHTML = `
                <div style="text-align: center;">
                    ${updateMessage}<br>
                    <button onclick="location.reload()" style="margin: 0.5rem; padding: 0.3rem 0.8rem; background: #22c55e; color: white; border: none; border-radius: 4px; cursor: pointer;">更新</button>
                    <button onclick="this.parentElement.parentElement.style.display='none'" style="margin: 0.5rem; padding: 0.3rem 0.8rem; background: #6b7280; color: white; border: none; border-radius: 4px; cursor: pointer;">後で</button>
                </div>
            `;
            
            // 10秒後に自動で隠す
            setTimeout(() => {
                if (this.elements.voiceFeedback) {
                    this.elements.voiceFeedback.style.display = 'none';
                }
            }, 10000);
        }
    }
}

// タイマークラス
class Timer {
    constructor(id, breadName, processName, duration, onComplete) {
        this.id = id;
        this.breadName = breadName;
        this.processName = processName;
        this.duration = duration; // 分単位
        this.originalDuration = duration * 60; // 秒単位
        this.status = 'running'; // running, paused, completed
        this.onComplete = onComplete;
        this.startTime = Date.now();
        this.pausedTime = 0;
        this.totalPausedDuration = 0; // 累積一時停止時間
        this.completedTime = null; // 完了時刻
        this.endTime = this.startTime + (duration * 60 * 1000); // 終了予定時刻
    }

    tick() {
        if (this.status !== 'running') return;
        
        // 実時間ベースで残り時間を計算
        const now = Date.now();
        const elapsed = (now - this.startTime - this.totalPausedDuration) / 1000;
        this.remainingTime = Math.max(0, this.originalDuration - elapsed);
        
        if (this.remainingTime <= 0) {
            this.complete();
        }
    }

    pause() {
        if (this.status === 'running') {
            this.status = 'paused';
            this.pausedTime = Date.now();
        }
    }

    resume() {
        if (this.status === 'paused') {
            this.status = 'running';
            const pauseDuration = Date.now() - this.pausedTime;
            this.totalPausedDuration += pauseDuration;
        }
    }

    reset() {
        this.remainingTime = this.originalDuration;
        this.status = 'running';
        this.startTime = Date.now();
        this.pausedTime = 0;
        this.totalPausedDuration = 0;
        this.endTime = this.startTime + (this.duration * 60 * 1000);
    }

    complete() {
        if (this.status !== 'completed') {
            this.status = 'completed';
            this.remainingTime = 0;
            this.completedTime = Date.now(); // 完了時刻を記録
            if (this.onComplete) {
                this.onComplete(this);
            }
        }
    }

    stop() {
        this.status = 'completed';
    }

    getProgressPercentage() {
        const elapsed = this.originalDuration - this.remainingTime;
        return Math.min(100, Math.max(0, (elapsed / this.originalDuration) * 100));
    }

    serialize() {
        return {
            id: this.id,
            breadName: this.breadName,
            processName: this.processName,
            duration: this.duration,
            remainingTime: this.remainingTime,
            originalDuration: this.originalDuration,
            status: this.status,
            startTime: this.startTime,
            pausedTime: this.pausedTime,
            totalPausedDuration: this.totalPausedDuration,
            endTime: this.endTime,
            completedTime: this.completedTime
        };
    }

    static deserialize(data, onComplete) {
        const timer = new Timer(data.id, data.breadName, data.processName, data.duration, onComplete);
        timer.remainingTime = data.remainingTime;
        timer.originalDuration = data.originalDuration;
        timer.status = data.status;
        timer.startTime = data.startTime;
        timer.pausedTime = data.pausedTime;
        timer.totalPausedDuration = data.totalPausedDuration || 0;
        timer.endTime = data.endTime || (data.startTime + (data.duration * 60 * 1000));
        timer.completedTime = data.completedTime || null;
        return timer;
    }
}

// アプリケーションの初期化
let panasiApp;
document.addEventListener('DOMContentLoaded', () => {
    panasiApp = new PanasiApp();
    
    // グローバル変数として設定（HTML内のonclickで使用）
    window.panasiApp = panasiApp;
    
    // 通知許可要求
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
});