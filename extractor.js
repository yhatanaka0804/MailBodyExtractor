/*
 * メール本文抽出
 */


/**
 * コンストラクタ
 */
var Extractor = function () {
  this.LINE_FEED = '\r\n';

  this.SIGNATURE_FIRST_LINE_LIMIT = 15; // 末尾から最初の署名区切りが現れるまでの行数制限
  this.SIGNATURE_LINE_LIMIT = 20; // 署名を有効とする行数
  this.SIGNATURE_FOUND_COUNT_LIMIT = 3; // 署名区切りの発見件数制限

  this.initParams();
};

/**
 * メール本文抽出
 * @param {String} inputText 
 * @returns {String}
 */
Extractor.prototype.extract = function (inputText) {
  // 抽出開始位置初期化
  this.startIndex = 0;

  // 改行コードの統一
  inputText = this.normalizeLineFeed(inputText);

  // 行で分割
  var textLines = this.splitLine(inputText);
  var initRows = textLines.length;

  // トレイラーの除去
  textLines = this.removeTrailer(textLines);

  // ヘッダーの除去
  textLines = this.removeHeader(textLines);

  // 先頭と末尾の空行を削除
  textLines = this.removeEmptyLine(textLines);
  var rows = textLines.length;

  // 結合する
  var outputText = textLines.join(this.LINE_FEED);

  // 結果が空になってしまう場合は入力テキストをそのまま返す
  if (outputText.length === 0) {
    outputText = inputText;
    this.startIndex = 0;
    rows = initRows;
  }

  return {
    text: outputText,
    startLineNo: this.startIndex + 1,
    lineCount: rows
  };
};

/**
 * 改行コードを 0x0a に統一
 * @param {String} str 
 * @returns {String}
 */
Extractor.prototype.normalizeLineFeed = function (str) {
  str = str.replace('\r\n', '\n');
  str = str.replace('\r', '\n');
  return str;
};

/**
 * 行分割
 * @param {String} inputText 
 * @returns {Array}
 */
Extractor.prototype.splitLine = function (inputText) {
  return inputText.split('\n');
};

/**
 * トレイラーの除去
 * @param {Array} textLines 
 * @returns {Array}
 */
Extractor.prototype.removeTrailer = function (textLines) {
  // 引用部分の削除
  textLines = this.removeTrailerQuote(textLines);
  // 引用部分の条件除去
  textLines = this.removeUnconditionally(textLines, this.defTrailQuote);
  // 署名部分の条件削除
  textLines = this.removeUnconditionally(textLines, this.defSignature);
  // 署名部分の削除
  textLines = this.removeSignature(textLines);
  // 挨拶の削除
  textLines = this.removeUnconditionally(textLines, this.defTrailGreeting);

  return textLines;
};

/**
 * ヘッダーの除去
 * @param {Array} textLines 
 * @returns {Array}
 */
Extractor.prototype.removeHeader = function (textLines) {
  // ヘッダーの削除
  textLines = this.removeUnconditionally(textLines, this.defHeader);

  // 宛名の削除
  textLines = this.removeUnconditionally(textLines, this.defHeaderDestination);

  // 挨拶の削除
  textLines = this.removeUnconditionally(textLines, this.defHeaderGreeting);

  return textLines;
};

/**
 * 先頭と末尾の空行を削除
 * @param {Array} textLines 
 */
Extractor.prototype.removeEmptyLine = function (textLines) {
  var idx;
  // 先頭
  var foundIdx = -1;
  for (idx = 0; idx < textLines.length; idx++) {
    if (textLines[idx].trim().length > 0) {
      foundIdx = idx;
      break;
    }
  }
  if (foundIdx > 0) {
    textLines = textLines.slice(foundIdx);
    this.startIndex += foundIdx;
  } else if (idx === textLines.length) {
    textLines = [];
  }
  // 末尾
  for (idx = textLines.length - 1; idx >= 0; idx--) {
    if (textLines[idx].trim().length > 0) {
      textLines = textLines.slice(0, idx + 1);
      break;
    }
  }

  return textLines;
};

/**
 * 末尾からの連続した引用を削除
 * @param {Array} textLines 
 */
Extractor.prototype.removeTrailerQuote = function (textLines) {
  for (var idx = textLines.length - 1; idx >= 0; idx--) {
    var line = textLines[idx];
    // 空行は無視
    line = line.trim();
    if (line.length > 0) {
      if (line.charAt(0) !== '>') {
        textLines = textLines.slice(0, idx + 1);
        break;
      }
    }
  }
  return textLines;
};

/**
 * 署名部分の削除
 * @param {Array} textLines 
 * @returns {Array}
 */
Extractor.prototype.removeSignature = function (textLines) {
  // 空白を除き記号が続く行があれば署名欄区切りと認識
  var lineCount = 0;
  var lastFoundIdx = -1;
  var foundCount = 0;
  for (var idx = textLines.length - 1; idx >= 0; idx--) {
    var line = textLines[idx].trim();
    // 空白は削除
    line = line.replace(/[ 　]/g, '');
    // 空行は判定しない
    if (line.length > 0) {
      // 文末挨拶に一致する場合は終了
      var match = false;
      for (var i = 0; i < this.defTrailGreeting.length; i++) {
        var param = this.defTrailGreeting[i];
        match = this.isMatch(param, textLines, idx);
        if (match) {
          break;
        }
      }
      if (match) {
        break;
      }

      // 記号のみ？
      if (/^[!-/:-@\[-`{-~｡-･ｰ！-／：-＠［-｀｛-･ｰ‐-⯿゙-ゟ゠・-ヿ]{15,}/.test(line)) {
        lastFoundIdx = idx;

        foundCount++;
        if (foundCount >= this.SIGNATURE_FOUND_COUNT_LIMIT) {
          break;
        }
      }

      lineCount++;
      if (foundCount === 0 && lineCount >= this.SIGNATURE_FIRST_LINE_LIMIT) {
        break;
      }
      if (lineCount >= this.SIGNATURE_LINE_LIMIT) {
        break;
      }
    }
  }
  if (lastFoundIdx !== -1) {
    textLines = textLines.slice(0, lastFoundIdx);
  }
  return textLines;
};

/**
 * 条件に一致した場合無条件に除去を行う
 * @param {Array} textLines 
 * @param {Array} defParams 
 */
Extractor.prototype.removeUnconditionally = function (textLines, defParams) {
  for (var i = 0; i < defParams.length; i++) {
    var param = defParams[i];

    // 開始位置/進行方向
    var idx;
    var inc;
    switch (param.direction) {
      case 'forward':
        idx = 0;
        inc = 1;
        break;
      case 'backward':
        idx = textLines.length - 1;
        inc = -1;
        break;
      default:
        throw new Error('direction が未定義: ' + param.direction);
    }

    // 行毎に処理
    var repeat = false;
    var lineCount = 0;
    for (var j = 0; j < textLines.length; j++) {
      if (textLines[idx].trim().length > 0) {
        if (this.isMatch(param, textLines, idx)) {
          textLines = this.removeLines(param, textLines, idx);
          repeat = param.repeat;
          break;
        }

        lineCount++;
        if (param.lineLimit && lineCount >= param.lineLimit) {
          break;
        }
      }

      idx += inc;
    }

    // 繰り返す？
    if (repeat) {
      i--;
    }
  }
  return textLines;
};

/**
 * 条件に一致するか？
 * @param {Object} param 
 * @param {Array} textLines 
 * @param {Integer} idx 
 * @returns {Boolean}
 */
Extractor.prototype.isMatch = function (param, textLines, idx) {
  // 基本条件
  var result = param.condition.test(textLines[idx]);
  // 追加条件
  if (result && param.additionalCondition) {
    for (var i = 0; i < param.additionalCondition.length; i++) {
      var add = param.additionalCondition[i];

      // offset分移動(空行無視)
      var line = this.getTextLine(textLines, idx, add.offset);
      if (line === null) {
        result = false;
        break;
      }
      // 検証
      result = add.condition.test(line);
      if (!result) {
        break;
      }
    }
  }
  return result;
};

/**
 * idxからoffsetで指定された行を取得(空行無視)
 * 範囲外の場合はnullを返す
 * @param {Array} textLines 
 * @param {Integer} idx 
 * @param {Integer} offset 
 * @returns {String}
 */
Extractor.prototype.getTextLine = function (textLines, idx, offset) {
  var line = null;
  var offsetIdx = this.getOffsetIndex(textLines, idx, offset);
  if (offsetIdx >= 0) {
    line = textLines[offsetIdx];
  }
  return line;
};

/**
 * idxからoffsetで指定された行を取得(空行無視)
 * 範囲外の場合は -1 を返す
 * @param {Array} textLines 
 * @param {Integer} idx 
 * @param {Integer} offset 
 */
Extractor.prototype.getOffsetIndex = function (textLines, idx, offset) {
  var line = null;
  var inc = offset > 0 ? 1 : -1;

  while (offset !== 0) {
    idx += inc;

    // 範囲外なら終了
    if (idx < 0 || idx >= textLines.length) {
      break;
    }

    // 空行ではない場合
    if (textLines[idx].trim().length > 0) {
      offset -= inc;
    }
  }

  // 見つかった場合
  if (offset === 0) {
    return idx;
  } else {
    return -1;
  }
};

/**
 * パラメーターに従って行を削除
 * @param {Object} param 
 * @param {Array} textLines 
 * @param {Integer} idx 
 */
Extractor.prototype.removeLines = function (param, textLines, idx) {
  var offsetIndex = this.getOffsetIndex(textLines, idx, param.offset);
  if (offsetIndex >= 0) {
    switch (param.remove) {
      case 'forward':
        textLines = textLines.slice(offsetIndex + 1);
        this.startIndex += offsetIndex + 1;
        break;
      case 'backward':
        textLines = textLines.slice(0, offsetIndex);
        break;
      default:
        throw new Error('remove が未定義: ' + param.direction);
    }
  }
  return textLines;
};

/**
 * 各パラメーターの初期化
 */
Extractor.prototype.initParams = function () {
  // 引用部
  this.defTrailQuote = [{
    direction: 'forward',
    condition: /^-----[ ]?Original Message[ ]?----- From: .+$/,
    offset: 0,
    remove: 'backward'
  }, {
    direction: 'forward',
    condition: /^----------------------- Original Message -----------------------$/,
    additionalCondition: [{
      offset: -1,
      condition: /^Forwarded by .+@.+\..+$/,
    }],
    offset: -1,
    remove: 'backward'
  }, {
    // ----- Original Message -----
    // -----Original Message-----
    // ----------------------- Original Message -----------------------
    // -----------------------転送元のメール-----------------------
    // -------- Forwarded Message --------
    // ---------- 転送メッセージ ----------
    direction: 'forward',
    condition: /^-{5,}\s?((Original|Forwarded) Message|転送元のメール|転送メッセージ)\s?-{5,}$/,
    offset: 0,
    remove: 'backward'
  }, {
    // On 2016/12/13 16:45, foo bar wrote:
    direction: 'forward',
    condition: /^On \d{4}\/\d{1,2}\/\d{1,2}( |, at )?\d{1,2}:\d{1,2}, .+ wrote:$/,
    offset: 0,
    remove: 'backward'
  }, {
    // foo bar <foo@bar.baz> wrote on 2018/04/05 14:49:27:
    direction: 'forward',
    condition: /^.+@.+\..+ wrote on \d{4}\/\d{1,2}\/\d{1,2} \d{1,2}:\d{1,2}:\d{1,2}:$/,
    offset: 0,
    remove: 'backward'
  }, {
    direction: 'forward',
    condition: /^On .+, \d+ .+ \d{4} \d{1,2}:\d{1,2}:\d{1,2} .\d{4}$/,
    offset: 0,
    remove: 'backward'
  }, {
    direction: 'forward',
    condition: /^\d{4}.?\d{1,2}.?\d{1,2}.* \d{1,2}:\d{1,2}.*、.+@.+\..+の(メール|メッセージ):$/,
    offset: 0,
    remove: 'backward'
  }, {
    direction: 'forward',
    condition: /^---- On .+, \d{1,2} \d{1,2} \d{4} \d{1,2}:\d{1,2}:\d{1,2} .+@.+\..+ wrote ----$/,
    offset: 0,
    remove: 'backward'
  }, {
    // 2016/08/23 午前9:57 foo bar <foo@bar.baz>:
    direction: 'forward',
    condition: /^\d{4}.\d{1,2}.\d{1,2}.? .*\d{1,2}:\d{1,2} .+@.+\..+:$/,
    offset: 0,
    remove: 'backward'
  }, {
    // 2018年5月15日(火) 18:36 foo bar <foo@bar.baz>:
    direction: 'forward',
    condition: /^\d{4}年\d{1,2}月\d{1,2}日\(.+\) \d{1,2}:\d{1,2} .+@.+\..+:$/,
    offset: 0,
    remove: 'backward'
  }, {
    direction: 'forward',
    condition: /^(From|差出人): .+@.+\..+$/,
    additionalCondition: [{
      offset: 1,
      condition: /^(Sent|送信日時): .+$/,
    }],
    offset: 0,
    remove: 'backward'
  }, {
    direction: 'forward',
    condition: /^送信元: .+@.+\..+$/,
    additionalCondition: [{
      offset: 1,
      condition: /^宛先: .+$/,
    }],
    offset: 0,
    remove: 'backward'
  }, {
    direction: 'forward',
    condition: /^iPhoneから送信$/,
    offset: 0,
    remove: 'backward'
  }];

  // 署名
  this.defSignature = [{
    // RFC 3676(行末のスペースがないパターンも有効)
    direction: 'backward',
    lineLimit: this.SIGNATURE_LINE_LIMIT,
    condition: /^-- ?$/,
    offset: 0,
    remove: 'backward'
  }];

  // 文末挨拶
  this.defTrailGreeting = [{
    direction: 'backward',
    lineLimit: 2,
    condition: /^(よろ|宜)しく.*お(願|ねが)い.*ます[。]?$/,
    offset: 0,
    remove: 'backward'
  }, {
    direction: 'backward',
    lineLimit: 2,
    condition: /^(以上|何卒|今後|どうぞ|お手数).*(よろ|宜)しく.*お(願|ねが)い.*ます[。]?$/,
    offset: 0,
    remove: 'backward'
  }, {
    direction: 'backward',
    lineLimit: 2,
    condition: /^以上(です)?[。]?$/,
    offset: 0,
    remove: 'backward'
  }, {
    direction: 'backward',
    lineLimit: 2,
    condition: /^以上、.*$/,
    offset: 0,
    remove: 'backward'
  }];

  // ヘッダー
  this.defHeader = [{
    direction: 'forward',
    lineLimit: 4,
    condition: /^To:.*$/,
    additionalCondition: [{
      offset: 1,
      condition: /^Cc:.*$/,
    }, {
      offset: 2,
      condition: /^添付:.*$/,
    }, {
      offset: 3,
      condition: /^本文:.*$/,
    }],
    offset: 3,
    remove: 'forward'
  }];

  // 宛名
  this.defHeaderDestination = [{
    direction: 'forward',
    lineLimit: 3,
    condition: /^.+(様|さま|さん|社長|部長)[、。へ]?$/,
    repeat: true,
    offset: 0,
    remove: 'forward'
  }, {
    direction: 'forward',
    lineLimit: 3,
    condition: /^.*各位[、。へ]?$/,
    offset: 0,
    remove: 'forward'
  }];

  // 文頭挨拶
  this.defHeaderGreeting = [{
    direction: 'forward',
    lineLimit: 3,
    condition: /^(いつも|毎々|大変)?、?お世話に.+す.+(です|ます)[、。！]?$/,
    offset: 0,
    remove: 'forward'
  }, {
    direction: 'forward',
    lineLimit: 3,
    condition: /^(いつも|毎々|大変)?、?お世話に.+す[、。！]?$/,
    additionalCondition: [{
      offset: 1,
      condition: /^.+(です|ます)[。]?$/,
    }],
    offset: 1,
    remove: 'forward'
  }, {
    direction: 'forward',
    lineLimit: 3,
    condition: /^(いつも|毎々|大変)?、?お世話に.+す[、。！]?$/,
    offset: 0,
    remove: 'forward'
  }, {
    direction: 'forward',
    lineLimit: 3,
    condition: /^(お|御)(疲|つか)れ(様|さま)です.+です[、。！]?$/,
    offset: 0,
    remove: 'forward'
  }, {
    direction: 'forward',
    lineLimit: 3,
    condition: /^(お|御)(疲|つか)れ(様|さま)です[、。！]?$/,
    additionalCondition: [{
      offset: 1,
      condition: /^.+です[。]?$/,
    }],
    offset: 1,
    remove: 'forward'
  }, {
    direction: 'forward',
    lineLimit: 3,
    condition: /^(お|御)(疲|つか)れ(様|さま)です[、。！]?$/,
    offset: 0,
    remove: 'forward'
  }];

};
