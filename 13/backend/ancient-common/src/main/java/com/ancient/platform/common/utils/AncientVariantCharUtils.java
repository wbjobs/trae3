package com.ancient.platform.common.utils;

import cn.hutool.core.util.StrUtil;
import lombok.extern.slf4j.Slf4j;

import java.util.HashMap;
import java.util.Map;

/**
 * 古籍异体字规范化工具类
 * 将异体字、繁简字、古今字转换为标准规范字
 *
 * @author ancient-platform
 * @since 1.0.0
 */
@Slf4j
public class AncientVariantCharUtils {

    private static final Map<Character, Character> VARIANT_TO_STANDARD = new HashMap<>();

    static {
        initVariantMap();
    }

    private static void initVariantMap() {
        // 异体字 -> 标准字
        VARIANT_TO_STANDARD.put('𨳊', '門');
        VARIANT_TO_STANDARD.put('閁', '門');
        VARIANT_TO_STANDARD.put('閂', '門');
        VARIANT_TO_STANDARD.put('𨳍', '鬥');
        VARIANT_TO_STANDARD.put('鬬', '鬥');
        VARIANT_TO_STANDARD.put('鬪', '鬥');
        VARIANT_TO_STANDARD.put('𩰚', '鬥');
        VARIANT_TO_STANDARD.put('𣜩', '漆');
        VARIANT_TO_STANDARD.put('柒', '漆');
        VARIANT_TO_STANDARD.put('桼', '漆');
        VARIANT_TO_STANDARD.put('亰', '京');
        VARIANT_TO_STANDARD.put('亱', '夜');
        VARIANT_TO_STANDARD.put('𠀉', '兮');
        VARIANT_TO_STANDARD.put('𠀋', '兮');
        VARIANT_TO_STANDARD.put('𠂇', '左');
        VARIANT_TO_STANDARD.put('𠂈', '右');
        VARIANT_TO_STANDARD.put('𠆢', '人');
        VARIANT_TO_STANDARD.put('𠔥', '干');
        VARIANT_TO_STANDARD.put('乹', '乾');
        VARIANT_TO_STANDARD.put('亁', '乾');
        VARIANT_TO_STANDARD.put('𠃬', '乃');
        VARIANT_TO_STANDARD.put('廼', '乃');
        VARIANT_TO_STANDARD.put('𠄌', '刀');
        VARIANT_TO_STANDARD.put('𠋀', '何');
        VARIANT_TO_STANDARD.put('哬', '何');
        VARIANT_TO_STANDARD.put('𠍱', '修');
        VARIANT_TO_STANDARD.put('脩', '修');
        VARIANT_TO_STANDARD.put('𠎝', '修');
        VARIANT_TO_STANDARD.put('𠐔', '僚');
        VARIANT_TO_STANDARD.put('𠑇', '休');
        VARIANT_TO_STANDARD.put('𠓀', '以');
        VARIANT_TO_STANDARD.put('㠯', '以');
        VARIANT_TO_STANDARD.put('𠖳', '才');
        VARIANT_TO_STANDARD.put('𠗖', '代');
        VARIANT_TO_STANDARD.put('𠙺', '其');
        VARIANT_TO_STANDARD.put('丌', '其');
        VARIANT_TO_STANDARD.put('亓', '其');
        VARIANT_TO_STANDARD.put('𠚤', '坤');
        VARIANT_TO_STANDARD.put('堃', '坤');
        VARIANT_TO_STANDARD.put('𠛴', '刻');
        VARIANT_TO_STANDARD.put('𠝹', '劃');
        VARIANT_TO_STANDARD.put('劃', '划');
        VARIANT_TO_STANDARD.put('𠠆', '勤');
        VARIANT_TO_STANDARD.put('懃', '勤');
        VARIANT_TO_STANDARD.put('𠣘', '吳');
        VARIANT_TO_STANDARD.put('呉', '吳');
        VARIANT_TO_STANDARD.put('𠤎', '化');
        VARIANT_TO_STANDARD.put('𠥼', '卑');
        VARIANT_TO_STANDARD.put('𠦝', '博');
        VARIANT_TO_STANDARD.put('愽', '博');
        VARIANT_TO_STANDARD.put('𠨑', '侯');
        VARIANT_TO_STANDARD.put('𠩺', '參');
        VARIANT_TO_STANDARD.put('叅', '參');
        VARIANT_TO_STANDARD.put('𠮷', '吉');
        VARIANT_TO_STANDARD.put('𠰴', '哉');
        VARIANT_TO_STANDARD.put('𠲽', '咨');
        VARIANT_TO_STANDARD.put('𠷈', '善');
        VARIANT_TO_STANDARD.put('譱', '善');
        VARIANT_TO_STANDARD.put('𠹭', '哉');
        VARIANT_TO_STANDARD.put('𠾱', '器');
        VARIANT_TO_STANDARD.put('噐', '器');
        VARIANT_TO_STANDARD.put('𡈽', '土');
        VARIANT_TO_STANDARD.put('𡉏', '在');
        VARIANT_TO_STANDARD.put('𡋾', '別');
        VARIANT_TO_STANDARD.put('彆', '別');
        VARIANT_TO_STANDARD.put('𡌹', '哉');
        VARIANT_TO_STANDARD.put('𡎐', '地');
        VARIANT_TO_STANDARD.put('墬', '地');
        VARIANT_TO_STANDARD.put('𡐓', '康');
        VARIANT_TO_STANDARD.put('𡘙', '太');
        VARIANT_TO_STANDARD.put('冭', '太');
        VARIANT_TO_STANDARD.put('𡚒', '奔');
        VARIANT_TO_STANDARD.put('犇', '奔');
        VARIANT_TO_STANDARD.put('𡢘', '孟');
        VARIANT_TO_STANDARD.put('𡤃', '好');
        VARIANT_TO_STANDARD.put('𡥉', '孝');
        VARIANT_TO_STANDARD.put('𡨭', '守');
        VARIANT_TO_STANDARD.put('𡩋', '宗');
        VARIANT_TO_STANDARD.put('𡬁', '定');
        VARIANT_TO_STANDARD.put('𡱖', '害');
        VARIANT_TO_STANDARD.put('𡴋', '將');
        VARIANT_TO_STANDARD.put('𡵅', '專');
        VARIANT_TO_STANDARD.put('耑', '專');
        VARIANT_TO_STANDARD.put('𡶡', '崩');
        VARIANT_TO_STANDARD.put('𡸷', '危');
        VARIANT_TO_STANDARD.put('𡼏', '厚');
        VARIANT_TO_STANDARD.put('𢀖', '經');
        VARIANT_TO_STANDARD.put('𢁾', '聖');
        VARIANT_TO_STANDARD.put('𢂚', '爭');
        VARIANT_TO_STANDARD.put('爭', '争');
        VARIANT_TO_STANDARD.put('𢃄', '奪');
        VARIANT_TO_STANDARD.put('𢄐', '貶');
        VARIANT_TO_STANDARD.put('𢅥', '爾');
        VARIANT_TO_STANDARD.put('爾', '尔');
        VARIANT_TO_STANDARD.put('𢆡', '幼');
        VARIANT_TO_STANDARD.put('𢇃', '才');
        VARIANT_TO_STANDARD.put('𢈈', '年');
        VARIANT_TO_STANDARD.put('秊', '年');
        VARIANT_TO_STANDARD.put('𢉼', '哉');
        VARIANT_TO_STANDARD.put('𢊍', '廟');
        VARIANT_TO_STANDARD.put('庿', '廟');
        VARIANT_TO_STANDARD.put('𢋫', '厚');
        VARIANT_TO_STANDARD.put('𢌞', '回');
        VARIANT_TO_STANDARD.put('𢎭', '恆');
        VARIANT_TO_STANDARD.put('恆', '恒');
        VARIANT_TO_STANDARD.put('𢐗', '德');
        VARIANT_TO_STANDARD.put('悳', '德');
        VARIANT_TO_STANDARD.put('𢘫', '忘');
        VARIANT_TO_STANDARD.put('𢛳', '惡');
        VARIANT_TO_STANDARD.put('𢝰', '戚');
        VARIANT_TO_STANDARD.put('𢞴', '恐');
        VARIANT_TO_STANDARD.put('𢠩', '恭');
        VARIANT_TO_STANDARD.put('𢡊', '敬');
        VARIANT_TO_STANDARD.put('𢡖', '戚');
        VARIANT_TO_STANDARD.put('𢣷', '愛');
        VARIANT_TO_STANDARD.put('愛', '爱');
        VARIANT_TO_STANDARD.put('𢤙', '憂');
        VARIANT_TO_STANDARD.put('𢦓', '戎');
        VARIANT_TO_STANDARD.put('𢨛', '戮');
        VARIANT_TO_STANDARD.put('𢩮', '懿');
        VARIANT_TO_STANDARD.put('𢫏', '拜');
        VARIANT_TO_STANDARD.put('拝', '拜');
        VARIANT_TO_STANDARD.put('𢭃', '抖');
        VARIANT_TO_STANDARD.put('𢰝', '持');
        VARIANT_TO_STANDARD.put('𢱑', '打');
        VARIANT_TO_STANDARD.put('𢲈', '敏');
        VARIANT_TO_STANDARD.put('𢴃', '掾');
        VARIANT_TO_STANDARD.put('𢵧', '搔');
        VARIANT_TO_STANDARD.put('𢸍', '撫');
        VARIANT_TO_STANDARD.put('𢹂', '揖');
        VARIANT_TO_STANDARD.put('𢽪', '敬');
        VARIANT_TO_STANDARD.put('𢿘', '亂');
        VARIANT_TO_STANDARD.put('亂', '乱');
        VARIANT_TO_STANDARD.put('𣀊', '寧');
        VARIANT_TO_STANDARD.put('甯', '寧');
        VARIANT_TO_STANDARD.put('𣃁', '斲');
        VARIANT_TO_STANDARD.put('𣃚', '斷');
        VARIANT_TO_STANDARD.put('𣆳', '晉');
        VARIANT_TO_STANDARD.put('𣇈', '曉');
        VARIANT_TO_STANDARD.put('𣍊', '有');
        VARIANT_TO_STANDARD.put('𣎴', '肉');
        VARIANT_TO_STANDARD.put('𣏹', '桓');
        VARIANT_TO_STANDARD.put('𣐤', '憂');
        VARIANT_TO_STANDARD.put('𣑭', '札');
        VARIANT_TO_STANDARD.put('𣓿', '棹');
        VARIANT_TO_STANDARD.put('櫂', '棹');
        VARIANT_TO_STANDARD.put('𣕹', '枯');
        VARIANT_TO_STANDARD.put('𣘚', '其');
        VARIANT_TO_STANDARD.put('𣜿', '椒');
        VARIANT_TO_STANDARD.put('𣞁', '枕');
        VARIANT_TO_STANDARD.put('𣟗', '死');
        VARIANT_TO_STANDARD.put('𣠼', '勞');
        VARIANT_TO_STANDARD.put('勞', '劳');
        VARIANT_TO_STANDARD.put('𣤶', '欲');
        VARIANT_TO_STANDARD.put('𣥺', '步');
        VARIANT_TO_STANDARD.put('𣧑', '死');
        VARIANT_TO_STANDARD.put('𣩂', '殆');
        VARIANT_TO_STANDARD.put('𣪊', '對');
        VARIANT_TO_STANDARD.put('對', '对');
        VARIANT_TO_STANDARD.put('𣱼', '沒');
        VARIANT_TO_STANDARD.put('歿', '沒');
        VARIANT_TO_STANDARD.put('𣲙', '冰');
        VARIANT_TO_STANDARD.put('氷', '冰');
        VARIANT_TO_STANDARD.put('𣳾', '汎');
        VARIANT_TO_STANDARD.put('氾', '汎');
        VARIANT_TO_STANDARD.put('𣴅', '法');
        VARIANT_TO_STANDARD.put('灋', '法');
        VARIANT_TO_STANDARD.put('𣵠', '盍');
        VARIANT_TO_STANDARD.put('𣶷', '潯');
        VARIANT_TO_STANDARD.put('𣷹', '沒');
        VARIANT_TO_STANDARD.put('𣹢', '溢');
        VARIANT_TO_STANDARD.put('𣽁', '深');
        VARIANT_TO_STANDARD.put('𣾴', '清');
        VARIANT_TO_STANDARD.put('淸', '清');
        VARIANT_TO_STANDARD.put('𤀽', '況');
        VARIANT_TO_STANDARD.put('𤂌', '濟');
        VARIANT_TO_STANDARD.put('濟', '济');
        VARIANT_TO_STANDARD.put('𤆄', '烈');
        VARIANT_TO_STANDARD.put('𤇾', '熾');
        VARIANT_TO_STANDARD.put('𤋎', '然');
        VARIANT_TO_STANDARD.put('𤌙', '然');
        VARIANT_TO_STANDARD.put('𤍠', '無');
        VARIANT_TO_STANDARD.put('旡', '既');
        VARIANT_TO_STANDARD.put('𤎸', '愛');
        VARIANT_TO_STANDARD.put('𤐫', '然');
        VARIANT_TO_STANDARD.put('𤐶', '燁');
        VARIANT_TO_STANDARD.put('烨', '燁');
        VARIANT_TO_STANDARD.put('𤐻', '焦');
        VARIANT_TO_STANDARD.put('𤑳', '煕');
        VARIANT_TO_STANDARD.put('熙', '煕');
        VARIANT_TO_STANDARD.put('𤲃', '異');
        VARIANT_TO_STANDARD.put('異', '异');
        VARIANT_TO_STANDARD.put('𤴔', '願');
        VARIANT_TO_STANDARD.put('願', '愿');
        VARIANT_TO_STANDARD.put('𤸎', '矣');
        VARIANT_TO_STANDARD.put('𤹐', '琴');
        VARIANT_TO_STANDARD.put('琹', '琴');
        VARIANT_TO_STANDARD.put('𥁄', '甚');
        VARIANT_TO_STANDARD.put('𥄕', '首');
        VARIANT_TO_STANDARD.put('𥆮', '視');
        VARIANT_TO_STANDARD.put('眎', '視');
        VARIANT_TO_STANDARD.put('𥇍', '見');
        VARIANT_TO_STANDARD.put('見', '见');
        VARIANT_TO_STANDARD.put('𥐝', '殆');
        VARIANT_TO_STANDARD.put('𥑬', '矦');
        VARIANT_TO_STANDARD.put('𥕦', '聖');
        VARIANT_TO_STANDARD.put('聖', '圣');
        VARIANT_TO_STANDARD.put('𥙐', '裨');
        VARIANT_TO_STANDARD.put('𥝋', '秋');
        VARIANT_TO_STANDARD.put('𥠇', '箕');
        VARIANT_TO_STANDARD.put('𥡗', '肄');
        VARIANT_TO_STANDARD.put('𥢇', '身');
        VARIANT_TO_STANDARD.put('𥤃', '齋');
        VARIANT_TO_STANDARD.put('𥦖', '窺');
        VARIANT_TO_STANDARD.put('𥨊', '窕');
        VARIANT_TO_STANDARD.put('𥪮', '竪');
        VARIANT_TO_STANDARD.put('竪', '竖');
        VARIANT_TO_STANDARD.put('𥮫', '簪');
        VARIANT_TO_STANDARD.put('𥱥', '而');
        VARIANT_TO_STANDARD.put('耏', '而');
        VARIANT_TO_STANDARD.put('𥸮', '爾');
        VARIANT_TO_STANDARD.put('𦉈', '失');
        VARIANT_TO_STANDARD.put('𦊘', '哉');
        VARIANT_TO_STANDARD.put('𦍌', '善');
        VARIANT_TO_STANDARD.put('𦏵', '翰');
        VARIANT_TO_STANDARD.put('𦒍', '尚');
        VARIANT_TO_STANDARD.put('𦓚', '省');
        VARIANT_TO_STANDARD.put('𦕓', '翼');
        VARIANT_TO_STANDARD.put('𦖠', '耳');
        VARIANT_TO_STANDARD.put('𦙮', '厥');
        VARIANT_TO_STANDARD.put('𦛨', '勞');
        VARIANT_TO_STANDARD.put('𦞤', '肥');
        VARIANT_TO_STANDARD.put('𦠻', '胤');
        VARIANT_TO_STANDARD.put('𦡆', '脩');
        VARIANT_TO_STANDARD.put('𦣝', '矣');
        VARIANT_TO_STANDARD.put('𦤇', '肆');
        VARIANT_TO_STANDARD.put('𦥑', '臼');
        VARIANT_TO_STANDARD.put('𦧒', '𦧚');
        VARIANT_TO_STANDARD.put('𦨣', '艱');
        VARIANT_TO_STANDARD.put('艱', '艰');
        VARIANT_TO_STANDARD.put('𦩷', '若');
        VARIANT_TO_STANDARD.put('𦪋', '道');
        VARIANT_TO_STANDARD.put('𦭵', '落');
        VARIANT_TO_STANDARD.put('𦮗', '葉');
        VARIANT_TO_STANDARD.put('葉', '叶');
        VARIANT_TO_STANDARD.put('𦰩', '莫');
        VARIANT_TO_STANDARD.put('𦱾', '莽');
        VARIANT_TO_STANDARD.put('𦲷', '來');
        VARIANT_TO_STANDARD.put('來', '来');
        VARIANT_TO_STANDARD.put('𦳕', '莒');
        VARIANT_TO_STANDARD.put('𦹮', '薦');
        VARIANT_TO_STANDARD.put('𦿆', '萬');
        VARIANT_TO_STANDARD.put('萬', '万');
        VARIANT_TO_STANDARD.put('𧀼', '蔑');
        VARIANT_TO_STANDARD.put('𧁒', '苟');
        VARIANT_TO_STANDARD.put('𧄍', '華');
        VARIANT_TO_STANDARD.put('華', '华');
        VARIANT_TO_STANDARD.put('𧅵', '季');
        VARIANT_TO_STANDARD.put('𧇾', '幾');
        VARIANT_TO_STANDARD.put('幾', '几');
        VARIANT_TO_STANDARD.put('𧊅', '乎');
        VARIANT_TO_STANDARD.put('𧋊', '豈');
        VARIANT_TO_STANDARD.put('豈', '岂');
        VARIANT_TO_STANDARD.put('𧍒', '雖');
        VARIANT_TO_STANDARD.put('雖', '虽');
        VARIANT_TO_STANDARD.put('𧐎', '賊');
        VARIANT_TO_STANDARD.put('賊', '贼');
        VARIANT_TO_STANDARD.put('𧑅', '貳');
        VARIANT_TO_STANDARD.put('貳', '贰');
        VARIANT_TO_STANDARD.put('𧒄', '責');
        VARIANT_TO_STANDARD.put('責', '责');
        VARIANT_TO_STANDARD.put('𧗠', '衍');
        VARIANT_TO_STANDARD.put('𧘕', '衆');
        VARIANT_TO_STANDARD.put('衆', '众');
        VARIANT_TO_STANDARD.put('𧚄', '見');
        VARIANT_TO_STANDARD.put('𧜎', '哀');
        VARIANT_TO_STANDARD.put('𧢝', '覬');
        VARIANT_TO_STANDARD.put('𧤕', '獸');
        VARIANT_TO_STANDARD.put('獸', '兽');
        VARIANT_TO_STANDARD.put('𧦣', '謀');
        VARIANT_TO_STANDARD.put('𧨷', '幾');
        VARIANT_TO_STANDARD.put('𧩹', '譽');
        VARIANT_TO_STANDARD.put('譽', '誉');
        VARIANT_TO_STANDARD.put('𧭥', '謝');
        VARIANT_TO_STANDARD.put('謝', '谢');
        VARIANT_TO_STANDARD.put('𧮳', '告');
        VARIANT_TO_STANDARD.put('𧰼', '乾');
        VARIANT_TO_STANDARD.put('𧲨', '猷');
        VARIANT_TO_STANDARD.put('𧵓', '敗');
        VARIANT_TO_STANDARD.put('敗', '败');
        VARIANT_TO_STANDARD.put('𧸐', '賤');
        VARIANT_TO_STANDARD.put('賤', '贱');
        VARIANT_TO_STANDARD.put('𧹏', '則');
        VARIANT_TO_STANDARD.put('則', '则');
        VARIANT_TO_STANDARD.put('𧾷', '足');
        VARIANT_TO_STANDARD.put('跡', '迹');
        VARIANT_TO_STANDARD.put('𨀉', '起');
        VARIANT_TO_STANDARD.put('𨀤', '蹇');
        VARIANT_TO_STANDARD.put('𨂊', '過');
        VARIANT_TO_STANDARD.put('過', '过');
        VARIANT_TO_STANDARD.put('𨒂', '延');
        VARIANT_TO_STANDARD.put('𨓆', '遂');
        VARIANT_TO_STANDARD.put('𨕙', '逃');
        VARIANT_TO_STANDARD.put('𨗨', '遂');
        VARIANT_TO_STANDARD.put('𨙷', '都');
        VARIANT_TO_STANDARD.put('𨛘', '鄙');
        VARIANT_TO_STANDARD.put('𨞠', '耶');
        VARIANT_TO_STANDARD.put('𨠫', '醒');
        VARIANT_TO_STANDARD.put('𨢇', '鄭');
        VARIANT_TO_STANDARD.put('鄭', '郑');
        VARIANT_TO_STANDARD.put('𨤍', '醯');
        VARIANT_TO_STANDARD.put('𨥙', '金');
        VARIANT_TO_STANDARD.put('𨦪', '躍');
        VARIANT_TO_STANDARD.put('躍', '跃');
        VARIANT_TO_STANDARD.put('𨭎', '珍');
        VARIANT_TO_STANDARD.put('珎', '珍');
        VARIANT_TO_STANDARD.put('𨰉', '辭');
        VARIANT_TO_STANDARD.put('辭', '辞');
        VARIANT_TO_STANDARD.put('𨸹', '辟');
        VARIANT_TO_STANDARD.put('𨺉', '陵');
        VARIANT_TO_STANDARD.put('𨻶', '隙');
        VARIANT_TO_STANDARD.put('𩁹', '雲');
        VARIANT_TO_STANDARD.put('雲', '云');
        VARIANT_TO_STANDARD.put('𩃬', '靈');
        VARIANT_TO_STANDARD.put('靈', '灵');
        VARIANT_TO_STANDARD.put('𩅰', '于');
        VARIANT_TO_STANDARD.put('𩆨', '靈');
        VARIANT_TO_STANDARD.put('𩇕', '靝');
        VARIANT_TO_STANDARD.put('𩈶', '餒');
        VARIANT_TO_STANDARD.put('𩋣', '靡');
        VARIANT_TO_STANDARD.put('𩌁', '顧');
        VARIANT_TO_STANDARD.put('顧', '顾');
        VARIANT_TO_STANDARD.put('𩐳', '韻');
        VARIANT_TO_STANDARD.put('韻', '韵');
        VARIANT_TO_STANDARD.put('𩔫', '首');
        VARIANT_TO_STANDARD.put('𩗩', '飄');
        VARIANT_TO_STANDARD.put('飄', '飘');
        VARIANT_TO_STANDARD.put('𩙻', '頹');
        VARIANT_TO_STANDARD.put('頹', '颓');
        VARIANT_TO_STANDARD.put('𩛿', '饋');
        VARIANT_TO_STANDARD.put('饋', '馈');
        VARIANT_TO_STANDARD.put('𩜲', '飽');
        VARIANT_TO_STANDARD.put('飽', '饱');
        VARIANT_TO_STANDARD.put('𩠐', '首');
        VARIANT_TO_STANDARD.put('𩣺', '驟');
        VARIANT_TO_STANDARD.put('驟', '骤');
        VARIANT_TO_STANDARD.put('𩥇', '馳');
        VARIANT_TO_STANDARD.put('馳', '驰');
        VARIANT_TO_STANDARD.put('𩨨', '骨');
        VARIANT_TO_STANDARD.put('𩫛', '聖');
        VARIANT_TO_STANDARD.put('𩰬', '猷');
        VARIANT_TO_STANDARD.put('𩸭', '鮮');
        VARIANT_TO_STANDARD.put('鮮', '鲜');
        VARIANT_TO_STANDARD.put('𩺰', '魚');
        VARIANT_TO_STANDARD.put('魚', '鱼');
        VARIANT_TO_STANDARD.put('𩻸', '魚');
        VARIANT_TO_STANDARD.put('𪀔', '雝');
        VARIANT_TO_STANDARD.put('𪃎', '翟');
        VARIANT_TO_STANDARD.put('𪆒', '為');
        VARIANT_TO_STANDARD.put('為', '为');
        VARIANT_TO_STANDARD.put('𪇟', '鷄');
        VARIANT_TO_STANDARD.put('鷄', '鸡');
        VARIANT_TO_STANDARD.put('𪊑', '麥');
        VARIANT_TO_STANDARD.put('麥', '麦');
        VARIANT_TO_STANDARD.put('𪋋', '舊');
        VARIANT_TO_STANDARD.put('舊', '旧');
        VARIANT_TO_STANDARD.put('𪍑', '聖');
        VARIANT_TO_STANDARD.put('𪐷', '辯');
        VARIANT_TO_STANDARD.put('辯', '辩');
        VARIANT_TO_STANDARD.put('𪔂', '齒');
        VARIANT_TO_STANDARD.put('齒', '齿');
        VARIANT_TO_STANDARD.put('𪗱', '齋');
        VARIANT_TO_STANDARD.put('齋', '斋');
        VARIANT_TO_STANDARD.put('𪙤', '繼');
        VARIANT_TO_STANDARD.put('繼', '继');
        VARIANT_TO_STANDARD.put('𪜶', '陰');
        VARIANT_TO_STANDARD.put('陰', '阴');
        VARIANT_TO_STANDARD.put('𪟝', '勣');
        VARIANT_TO_STANDARD.put('勣', '绩');
        VARIANT_TO_STANDARD.put('𪢸', '壟');
        VARIANT_TO_STANDARD.put('壟', '垄');
        VARIANT_TO_STANDARD.put('𪣆', '歎');
        VARIANT_TO_STANDARD.put('歎', '叹');
        VARIANT_TO_STANDARD.put('𪤚', '壤');
        VARIANT_TO_STANDARD.put('壤', '壤');
        VARIANT_TO_STANDARD.put('𪪞', '牆');
        VARIANT_TO_STANDARD.put('牆', '墙');
        VARIANT_TO_STANDARD.put('𪫌', '離');
        VARIANT_TO_STANDARD.put('離', '离');
        VARIANT_TO_STANDARD.put('𬺕', '易');

        // 常见繁简对应补充
        VARIANT_TO_STANDARD.put('後', '后');
        VARIANT_TO_STANDARD.put('裡', '里');
        VARIANT_TO_STANDARD.put('裡', '里');
        VARIANT_TO_STANDARD.put('製', '制');
        VARIANT_TO_STANDARD.put('週', '周');
        VARIANT_TO_STANDARD.put('係', '系');
        VARIANT_TO_STANDARD.put('啟', '启');
        VARIANT_TO_STANDARD.put('巖', '岩');
        VARIANT_TO_STANDARD.put('嵒', '岩');
        VARIANT_TO_STANDARD.put('祕', '秘');
        VARIANT_TO_STANDARD.put('蹟', '迹');
        VARIANT_TO_STANDARD.put('邨', '村');
        VARIANT_TO_STANDARD.put('邨', '村');
        VARIANT_TO_STANDARD.put('佇', '伫');
        VARIANT_TO_STANDARD.put('佇', '伫');
        VARIANT_TO_STANDARD.put('牀', '床');
        VARIANT_TO_STANDARD.put('床', '床');
        VARIANT_TO_STANDARD.put('寔', '实');
        VARIANT_TO_STANDARD.put('愷', '恺');
        VARIANT_TO_STANDARD.put('愷', '恺');
        VARIANT_TO_STANDARD.put('恊', '协');
        VARIANT_TO_STANDARD.put('忇', '协');
        VARIANT_TO_STANDARD.put('喆', '哲');
        VARIANT_TO_STANDARD.put('喆', '哲');
        VARIANT_TO_STANDARD.put('囘', '回');
        VARIANT_TO_STANDARD.put('迴', '回');
        VARIANT_TO_STANDARD.put('堦', '阶');
        VARIANT_TO_STANDARD.put('喈', '阶');
        VARIANT_TO_STANDARD.put('寃', '冤');
        VARIANT_TO_STANDARD.put('惌', '冤');
        VARIANT_TO_STANDARD.put('栢', '柏');
        VARIANT_TO_STANDARD.put('瓌', '瑰');
        VARIANT_TO_STANDARD.put('瓌', '瑰');
        VARIANT_TO_STANDARD.put('畧', '略');
        VARIANT_TO_STANDARD.put('畧', '略');
        VARIANT_TO_STANDARD.put('衆', '众');
        VARIANT_TO_STANDARD.put('眾', '众');
        VARIANT_TO_STANDARD.put('逹', '达');
        VARIANT_TO_STANDARD.put('達', '达');
        VARIANT_TO_STANDARD.put('閒', '间');
        VARIANT_TO_STANDARD.put('間', '间');
        VARIANT_TO_STANDARD.put('閑', '闲');
        VARIANT_TO_STANDARD.put('閒', '闲');
        VARIANT_TO_STANDARD.put('陞', '升');
        VARIANT_TO_STANDARD.put('昇', '升');
        VARIANT_TO_STANDARD.put('陞', '升');
        VARIANT_TO_STANDARD.put('隄', '堤');
        VARIANT_TO_STANDARD.put('堤', '堤');
        VARIANT_TO_STANDARD.put('飜', '翻');
        VARIANT_TO_STANDARD.put('飜', '翻');
        VARIANT_TO_STANDARD.put('駮', '驳');
        VARIANT_TO_STANDARD.put('駁', '驳');
        VARIANT_TO_STANDARD.put('髣', '仿');
        VARIANT_TO_STANDARD.put('髴', '佛');
        VARIANT_TO_STANDARD.put('髣髴', '仿佛');
        VARIANT_TO_STANDARD.put('麈', '尘');
        VARIANT_TO_STANDARD.put('塵', '尘');
        VARIANT_TO_STANDARD.put('麈', '尘');
    }

    /**
     * 单个字符异体字规范化
     *
     * @param c 输入字符
     * @return 规范化后的字符
     */
    public static char normalize(char c) {
        Character standard = VARIANT_TO_STANDARD.get(c);
        return standard != null ? standard : c;
    }

    /**
     * 字符串异体字规范化
     *
     * @param text 输入文本
     * @return 规范化后的文本
     */
    public static String normalize(String text) {
        if (StrUtil.isBlank(text)) {
            return text;
        }

        StringBuilder result = new StringBuilder(text.length());
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            result.append(normalize(c));
        }
        return result.toString();
    }

    /**
     * 异体字模糊匹配
     * 判断两个字符是否为异体字关系（包含相同标准字）
     *
     * @param c1 字符1
     * @param c2 字符2
     * @return 是否为异体字
     */
    public static boolean isVariant(char c1, char c2) {
        if (c1 == c2) {
            return true;
        }
        char norm1 = normalize(c1);
        char norm2 = normalize(c2);
        return norm1 == norm2;
    }

    /**
     * 文本模糊匹配
     * 判断两个文本在异体字规范化后是否相同
     *
     * @param text1 文本1
     * @param text2 文本2
     * @return 是否匹配
     */
    public static boolean fuzzyMatch(String text1, String text2) {
        if (text1 == null || text2 == null) {
            return text1 == text2;
        }
        return normalize(text1).equals(normalize(text2));
    }

    /**
     * 获取字符的所有异体形式
     *
     * @param standardChar 标准字符
     * @return 所有异体字符列表
     */
    public static java.util.List<Character> getVariants(char standardChar) {
        java.util.List<Character> variants = new java.util.ArrayList<>();
        for (Map.Entry<Character, Character> entry : VARIANT_TO_STANDARD.entrySet()) {
            if (entry.getValue() == standardChar) {
                variants.add(entry.getKey());
            }
        }
        return variants;
    }

    /**
     * 获取异体字映射表大小
     *
     * @return 映射条目数
     */
    public static int getVariantCount() {
        return VARIANT_TO_STANDARD.size();
    }

    /**
     * 自定义添加异体字映射
     *
     * @param variant  异体字
     * @param standard 标准字
     */
    public static void addVariant(char variant, char standard) {
        VARIANT_TO_STANDARD.put(variant, standard);
    }
}
