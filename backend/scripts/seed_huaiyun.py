"""
种子脚本：为怀云 (3079966793@qq.com) 账号补充全方位测试数据。

运行方式：
    cd backend && python -m scripts.seed_huaiyun
"""

import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from datetime import datetime, timezone
import ulid
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session
from app.core.security import hash_password
from app.models.user import User
from app.models.project import (
    Project, Chapter, ChapterVersion, Character, ProjectCharacter,
    WorldSetting, AIRuntimeSetting, ChapterMemory, ProjectStoryMemory,
    MemoryEvidenceLink, DocumentChunk, StoryEntity, StoryEvent,
    StoryRelation, StoryOpenLoop, CharacterChatSession,
)

EMAIL = "3079966793@qq.com"
PASSWORD = "123456tpf"

def uid() -> str:
    return str(ulid.new())

# ─────────────────────────────────────────────────────────────
# 三个项目的完整数据定义
# ─────────────────────────────────────────────────────────────

def build_project_1(owner_id: str):
    """《星辰之约》— 原创·现代奇幻·女频"""
    p_id = uid()
    chars = [
        dict(id=uid(), name="苏念星", alias="星辰之眼", owner_id=owner_id,
             description="天文学研究生，外表文静内心坚韧，意外觉醒星辰之力。",
             profile="女，24岁，身高165cm，黑色长发常扎马尾，戴银框眼镜。星辰大学天文学硕士。",
             personality="外冷内热。表面礼貌疏离，内心极其重感情。面对危险时冷静得出奇。",
             background="从小在孤儿院长大，12岁那年夜晚看到流星划过，从此痴迷天文学。",
             relationship_notes="与陆沉舟是命定守护关系，后产生感情。与林婉清是闺蜜。对白亦寒既感激又警惕。",
             tags="主角,女性,研究生,星辰守护者"),
        dict(id=uid(), name="陆沉舟", alias="暗夜守望者", owner_id=owner_id,
             description="神秘的星辰守护者，背负沉重过往，是苏念星的命定守护人。",
             profile="男，26岁，身高183cm，深棕色短发，瞳孔月光下泛星蓝色。表面是物理系讲师。",
             personality="沉默寡言，行事果断。对使命偏执，在苏念星面前不自觉温柔。",
             background="出身守护者世家陆家。十年前暗影入侵，陆家灭门，他是唯一幸存者。",
             relationship_notes="与苏念星是命定守护关系兼青梅竹马。与白亦寒曾是同门师兄弟，后决裂。",
             tags="主角,男性,守护者,讲师"),
        dict(id=uid(), name="白亦寒", alias="月影", owner_id=owner_id,
             description="表面温文尔雅的商业精英，暗地追寻禁忌之力，主要反派。",
             profile="男，28岁，身高180cm，银白色天生短发，白氏集团少总裁。",
             personality="双面人格。公众前温润如玉，私下冷酷无情。对力量病态渴望。",
             background="白家曾是守护者世家，百年前因追求禁忌之力被逐。从小被灌输复仇思想。",
             relationship_notes="与陆沉舟曾是同门师兄弟。对苏念星有扭曲执念。",
             tags="反派,男性,商业精英,暗影"),
        dict(id=uid(), name="林婉清", alias="灵蝶", owner_id=owner_id,
             description="苏念星室友兼闺蜜，身份神秘，与蝴蝶精怪有联系。",
             profile="女，23岁，身高160cm，栗色卷发，琥珀色眼睛。艺术系学生，擅水墨画。",
             personality="表面大大咧咧，实际心思细腻。对蝴蝶有偏执喜爱。",
             background="蝴蝶精怪后裔，拥有微弱灵力。画作中总出现同一只蝴蝶。",
             relationship_notes="与苏念星是最好的朋友，暗中保护她。对白亦寒有本能恐惧。",
             tags="配角,女性,精怪后裔,画家"),
    ]
    chaps = [
        dict(id=uid(), title="第一章 星落凡尘", order_index=0, status="done", word_count=1280,
             content="<h2>一</h2><p>九月的星辰大学，梧桐叶开始泛黄。苏念星抱着一摞天文学文献从图书馆出来时，天色已完全暗了。她习惯性地抬头望天。</p><p>今夜星空格外清澈，猎户座腰带三星整齐排列，天狼星闪烁着冷蓝色光芒。</p><p>\"又在数星星？\"一个低沉的男声从身后传来。</p><p>苏念星回头，看到穿着黑色风衣的陆沉舟站在路灯下，瞳孔在月光下泛着奇异蓝光。</p><p>他说了一句让她至今无法理解的话：\"参宿四的光，传了六百四十年才到达你的眼睛。而有些东西，等了比那更久。\"</p><h2>二</h2><p>刺骨寒风突然席卷，路灯闪烁后灭了。黑暗中，苏念星看到视野边缘出现奇异光点如微型星辰旋转。</p><p>陆沉舟挡在她身前，手持一把漆黑剑身流淌星光纹路的剑。</p><p>暗影兽从路灯杆的黑色裂痕中涌出。陆沉舟挥剑斩出弧光，但被斩断的暗影兽分裂成更多暗影。</p><p>就在这时，苏念星胸口的星形吊坠发出耀眼白光，化作光柱冲天而起，暗影兽在光芒中消融殆尽。</p><p>陆沉舟单膝跪在她面前：\"终于找到你了，星辰之眼。\"</p>",
             plain_text="九月的星辰大学，梧桐叶开始泛黄。苏念星抱着一摞天文学文献从图书馆出来时，天色已完全暗了。她习惯性地抬头望天。今夜星空格外清澈，猎户座腰带三星整齐排列，天狼星闪烁着冷蓝色光芒。\"又在数星星？\"一个低沉的男声从身后传来。苏念星回头，看到穿着黑色风衣的陆沉舟站在路灯下，瞳孔在月光下泛着奇异蓝光。他说了一句让她至今无法理解的话：\"参宿四的光，传了六百四十年才到达你的眼睛。而有些东西，等了比那更久。\"刺骨寒风突然席卷，路灯闪烁后灭了。黑暗中，苏念星看到视野边缘出现奇异光点如微型星辰旋转。陆沉舟挡在她身前，手持一把漆黑剑身流淌星光纹路的剑。暗影兽从路灯杆的黑色裂痕中涌出。陆沉舟挥剑斩出弧光，但被斩断的暗影兽分裂成更多暗影。就在这时，苏念星胸口的星形吊坠发出耀眼白光，化作光柱冲天而起，暗影兽在光芒中消融殆尽。陆沉舟单膝跪在她面前：\"终于找到你了，星辰之眼。\"",
             summary="苏念星夜晚遭遇暗影兽袭击，陆沉舟出手相救。星形吊坠爆发光芒消灭暗影兽，陆沉舟认出她是'星辰之眼'。",
             notes="开篇章节，建立世界观和主要角色关系。"),
        dict(id=uid(), title="第二章 守护者之誓", order_index=1, status="done", word_count=980,
             content="<h2>一</h2><p>陆沉舟带苏念星去了天文台地下三层——一个穹顶绘满星辰图谱的庞大空间，中央祭坛悬浮着星云流转的水晶球。</p><p>\"这里是东方结界的核心枢纽。一千年前，五位星辰守护者联手创造了结界，将暗影世界与人类世界隔绝。\"</p><p>墙壁上挂着五幅画像：陆氏以剑为誓守护光明，白氏以智为刃洞察暗影，林氏以蝶为媒沟通万物，沈氏以琴为弦稳定心神，叶氏以药为引治愈伤痕。</p><p>\"你是叶氏的后裔。\"陆沉舟指向第五幅画像。</p><h2>二</h2><p>二十年的人生认知被颠覆。苏念星不是孤儿院里没有来历的孩子——她是千年守护者家族后裔。</p><p>\"二十年前暗影势力大规模入侵，叶氏一族几乎全灭。你母亲临终前将你送到孤儿院，封印了你体内的星辰之力。那枚吊坠就是封印的钥匙。\"</p><p>\"封印正在减弱。苏念星，你必须做出选择——继续做普通人等待暗影找到你，或者接受命运，成为新的星辰守护者。\"</p>",
             plain_text="陆沉舟带苏念星去了天文台地下三层——一个穹顶绘满星辰图谱的庞大空间，中央祭坛悬浮着星云流转的水晶球。\"这里是东方结界的核心枢纽。一千年前，五位星辰守护者联手创造了结界，将暗影世界与人类世界隔绝。\"墙壁上挂着五幅画像：陆氏以剑为誓守护光明，白氏以智为刃洞察暗影，林氏以蝶为媒沟通万物，沈氏以琴为弦稳定心神，叶氏以药为引治愈伤痕。\"你是叶氏的后裔。\"陆沉舟指向第五幅画像。二十年的人生认知被颠覆。苏念星不是孤儿院里没有来历的孩子——她是千年守护者家族后裔。\"二十年前暗影势力大规模入侵，叶氏一族几乎全灭。你母亲临终前将你送到孤儿院，封印了你体内的星辰之力。那枚吊坠就是封印的钥匙。\"\"封印正在减弱。苏念星，你必须做出选择——继续做普通人等待暗影找到你，或者接受命运，成为新的星辰守护者。\"",
             summary="陆沉舟揭示星辰守护者历史和苏念星的真实身份——叶氏后裔。五大家族体系建立，身世之谜展开。",
             notes="世界观揭示章节，建立五大家族体系。"),
        dict(id=uid(), title="第三章 暗影低语", order_index=2, status="writing", word_count=850,
             content="<h2>一</h2><p>苏念星没有立刻给出答案。接下来三天，她试图回到正常生活——上课、做实验、写论文。但每当夜幕降临，她就会不自觉望向天空。</p><p>第四天晚上，林婉清兴奋地举着手机：\"念星你看！\"屏幕上是一张水墨画——蝴蝶停在星形吊坠上，周围环绕星光。</p><p>\"你怎么知道这个吊坠的形状？\"苏念星从未在她面前摘下过吊坠。</p><p>林婉清勉强一笑：\"我好像在梦里见过。\"</p><h2>二</h2><p>物理课上，陆沉舟讲量子纠缠。苏念星提问：\"如果两个纠缠粒子分别放在现实世界和暗影世界，还能保持纠缠吗？\"</p><p>\"取决于结界强度。如果结界出现裂缝……\"他没有说完，但苏念星听懂了。</p><p>下课后，白亦寒出现在教室门口递上咖啡。苏念星注意到他袖口下银色手链上的蝴蝶吊坠——和林婉清画中的一模一样。</p>",
             plain_text="苏念星没有立刻给出答案。接下来三天，她试图回到正常生活——上课、做实验、写论文。但每当夜幕降临，她就会不自觉望向天空。第四天晚上，林婉清兴奋地举着手机：\"念星你看！\"屏幕上是一张水墨画——蝴蝶停在星形吊坠上，周围环绕星光。\"你怎么知道这个吊坠的形状？\"苏念星从未在她面前摘下过吊坠。林婉清勉强一笑：\"我好像在梦里见过。\"物理课上，陆沉舟讲量子纠缠。苏念星提问：\"如果两个纠缠粒子分别放在现实世界和暗影世界，还能保持纠缠吗？\"\"取决于结界强度。如果结界出现裂缝……\"他没有说完，但苏念星听懂了。下课后，白亦寒出现在教室门口递上咖啡。苏念星注意到他袖口下银色手链上的蝴蝶吊坠——和林婉清画中的一模一样。",
             summary="苏念星犹豫不决，林婉清画出神秘蝴蝶画作暴露身份线索。白亦寒的蝴蝶吊坠与林婉清画中一致，暗示三人之间的隐秘联系。",
             notes="悬疑推进章节，林婉清身份线索和白亦寒的暗线。"),
        dict(id=uid(), title="第四章 星辰觉醒", order_index=3, status="draft", word_count=0,
             content=None, plain_text=None,
             summary=None, notes="计划章节：苏念星正式觉醒星辰之力，与陆沉舟并肩作战抵御暗影兽潮。"),
    ]
    world = dict(
        title="星辰世界观",
        overview="现代都市之下隐藏着由五大家族守护的古老结界，将暗影世界与人类世界隔绝。结界由星辰之力维系，每千年需要'星辰之眼'重新激活。",
        rules="1. 星辰之力源于星辰共鸣，需通过特定仪式觉醒\n2. 五大家族各有一种守护之力：剑、智、蝶、琴、药\n3. 暗影之力与星辰之力互为克制\n4. 结界崩裂会导致暗影兽入侵现实世界\n5. '星辰之眼'是预言中能重新激活结界的人",
        factions="守护者联盟：由五大家族残存力量组成，维护结界稳定。\n暗影组织：白亦寒领导，追求禁忌之力，试图打破结界。\n灵蝶一族：林婉清所属的精怪后裔，立场中立偏善。",
        locations="星辰大学：故事主要舞台，地下有结界核心枢纽。\n天文台地下三层：五大家族的秘密基地。\n白氏集团总部：白亦寒的大本营，地下有暗影祭坛。\n星辰湖：城郊湖泊，月圆之夜星辰之力最盛之处。",
        timeline="千年前：五大家族联手创造结界。\n二十年前：暗影入侵，叶氏灭门，苏念星被送入孤儿院。\n十年前：陆家灭门，陆沉舟成为唯一幸存者。\n故事开始：苏念星觉醒，暗影兽再次出现。",
        extra_notes="量子纠缠理论与星辰共鸣的对应关系可以作为后续情节的科学解释框架。蝴蝶在多个文化中象征灵魂和转化，与林婉清的角色设定呼应。",
    )
    return p_id, chars, chaps, world


def build_project_2(owner_id: str):
    """《长安月下》— 同人·古风·女频"""
    p_id = uid()
    chars = [
        dict(id=uid(), name="沈清歌", alias="月下仙", owner_id=owner_id,
             description="太医院最年轻的女医官，医术精湛却藏着惊天秘密。",
             profile="女，20岁，身高162cm，乌发如瀑，眉心一点朱砂痣。太医院医官，师从院正。",
             personality="温柔坚韧，对病人极度耐心。面对权贵不卑不亢，有自己坚守的底线。",
             background="幼年被遗弃在太医院门口，由院正收养。天赋异禀，十五岁便能独立看诊。暗中寻找失散的家人。",
             relationship_notes="与萧景琰是青梅竹马，后因身份差距疏远。与柳如烟是闺蜜。对太子有救命之恩。",
             tags="主角,女性,医官,古风"),
        dict(id=uid(), name="萧景琰", alias="冷面将军", owner_id=owner_id,
             description="镇北将军，战功赫赫却面冷心热，暗中守护沈清歌多年。",
             profile="男，25岁，身高185cm，剑眉星目，左脸有一道淡疤。镇北将军府主人。",
             personality="表面冷漠寡言，实际重情重义。战场上杀伐果断，私下会偷偷给流浪猫喂食。",
             background="将门之后，十六岁随父出征，二十岁独立领兵。父亲战死沙场后继承将军之位。",
             relationship_notes="与沈清歌青梅竹马，因身份差距主动疏远，但一直暗中保护她。与太子是挚友。",
             tags="主角,男性,将军,古风"),
        dict(id=uid(), name="柳如烟", alias="烟雨楼主", owner_id=owner_id,
             description="长安城最大的情报组织烟雨楼的幕后老板，亦正亦邪。",
             profile="女，24岁，身高168cm，容貌绝美，善用毒。烟雨楼主人。",
             personality="表面风情万种，实际心思缜密。信奉'没有永远的朋友，只有永远的利益'，但对真正的朋友极其忠诚。",
             background="前朝公主后裔，家族被灭后独自在江湖闯荡，建立了烟雨楼情报网。",
             relationship_notes="与沈清歌是闺蜜，暗中帮她查身世。与萧景琰有交易关系。对白月光有复杂感情。",
             tags="配角,女性,情报商,古风"),
    ]
    chaps = [
        dict(id=uid(), title="第一章 月上柳梢", order_index=0, status="done", word_count=1100,
             content="<h2>一</h2><p>长安城的夜，比白日更热闹三分。</p><p>沈清歌提着药箱穿过东市，两侧是灯火通明的酒楼和茶肆。她刚从城外义诊回来，身上的药香还没散尽。</p><p>\"沈医官！\"一个小厮气喘吁吁地跑来，\"将军府请您过去一趟，萧将军旧伤复发了！\"</p><p>沈清歌脚步一顿。萧景琰的旧伤她清楚——三年前北境之战留下的箭伤，每到阴雨天就会隐隐作痛。但'请她过去'这种事，从来不曾有过。</p><p>她到达将军府时，萧景琰正坐在书房里看书。烛光映照下，他的侧脸轮廓分明，那道淡疤反而增添了几分凌厉的美感。</p><p>\"将军，伤在哪里？\"沈清歌放下药箱。</p><p>萧景琰抬头看了她一眼，淡淡道：\"没有旧伤复发。\"</p><p>\"那……\"</p><p>\"有人要杀你。\"他说得云淡风轻，仿佛在说今天天气不错，\"今晚别回太医院了。\"</p>",
             plain_text="长安城的夜，比白日更热闹三分。沈清歌提着药箱穿过东市，两侧是灯火通明的酒楼和茶肆。她刚从城外义诊回来，身上的药香还没散尽。\"沈医官！\"一个小厮气喘吁吁地跑来，\"将军府请您过去一趟，萧将军旧伤复发了！\"沈清歌脚步一顿。萧景琰的旧伤她清楚——三年前北境之战留下的箭伤，每到阴雨天就会隐隐作痛。但'请她过去'这种事，从来不曾有过。她到达将军府时，萧景琰正坐在书房里看书。烛光映照下，他的侧脸轮廓分明，那道淡疤反而增添了几分凌厉的美感。\"将军，伤在哪里？\"沈清歌放下药箱。萧景琰抬头看了她一眼，淡淡道：\"没有旧伤复发。\"\"那……\"\"有人要杀你。\"他说得云淡风轻，仿佛在说今天天气不错，\"今晚别回太医院了。\"",
             summary="沈清歌被请到将军府，萧景琰告知有人要杀她，让她留在将军府过夜。两人多年未见的重逢。",
             notes="开篇章节，建立古风氛围和主角关系。"),
        dict(id=uid(), title="第二章 太医院暗涌", order_index=1, status="done", word_count=950,
             content="<h2>一</h2><p>第二天清晨，沈清歌回到太医院，发现自己的药房被人翻过了。</p><p>药材的摆放顺序变了——这是她多年来养成的习惯，每味药都有固定位置。有人动过她的东西，但手法很专业，普通人看不出来。</p><p>\"清歌，你昨晚去哪了？\"柳如烟不知何时出现在门口，手里摇着一把团扇。</p><p>\"你怎么进来的？\"</p><p>\"太医院的门对我来说形同虚设。\"柳如烟笑了笑，\"我来告诉你一件事——你师父，院正大人，今早被大理寺带走了。\"</p><p>沈清歌手中的药杵掉在地上。</p><p>\"罪名是：私通北狄，泄露军机。\"柳如烟的声音低了下去，\"但我知道这是栽赃。你师父是被灭口，因为他查到了一些不该查的东西。\"</p><p>\"什么东西？\"</p><p>柳如烟从袖中取出一封信，信封上没有署名，只画着一朵梅花。</p><p>\"二十年前的梅花案。\"她说，\"你的真实身世，就藏在这封信里。\"</p>",
             plain_text="第二天清晨，沈清歌回到太医院，发现自己的药房被人翻过了。药材的摆放顺序变了——这是她多年来养成的习惯，每味药都有固定位置。有人动过她的东西，但手法很专业，普通人看不出来。\"清歌，你昨晚去哪了？\"柳如烟不知何时出现在门口，手里摇着一把团扇。\"你怎么进来的？\"\"太医院的门对我来说形同虚设。\"柳如烟笑了笑，\"我来告诉你一件事——你师父，院正大人，今早被大理寺带走了。\"沈清歌手中的药杵掉在地上。\"罪名是：私通北狄，泄露军机。\"柳如烟的声音低了下去，\"但我知道这是栽赃。你师父是被灭口，因为他查到了一些不该查的东西。\"\"什么东西？\"柳如烟从袖中取出一封信，信封上没有署名，只画着一朵梅花。\"二十年前的梅花案。\"她说，\"你的真实身世，就藏在这封信里。\"",
             summary="太医院被翻，院正被大理寺带走。柳如烟带来关于沈清歌身世的线索——二十年前的梅花案。",
             notes="悬疑推进，身世之谜展开。"),
        dict(id=uid(), title="第三章 烟雨楼密谈", order_index=2, status="writing", word_count=600,
             content="<h2>一</h2><p>烟雨楼坐落在长安城最繁华的地段，外表是一座普通的茶楼，实际是长安最大的情报交易所。</p><p>柳如烟带沈清歌来到三楼的密室，墙上挂满了各色人物的画像和情报。</p><p>\"二十年前，长安城发生过一桩灭门案。\"柳如烟指着墙上一幅泛黄的画像，\"礼部尚书沈家，满门三十七口，一夜之间尽数被杀。唯一幸存的，是一个刚出生三天的女婴。\"</p><p>沈清歌的心跳漏了一拍。</p><p>\"那个女婴，就是你。\"柳如烟转身面对她，\"你的父亲沈正清发现了当朝宰相通敌叛国的证据，所以被灭口。而你被院正大人偷偷带出，养在太医院。\"</p><p>\"那……杀我的人……\"</p><p>\"宰相的人。他们发现你还没死，而且你师父开始重新调查当年的案子。\"柳如烟叹了口气，\"清歌，你现在很危险。\"</p>",
             plain_text="烟雨楼坐落在长安城最繁华的地段，外表是一座普通的茶楼，实际是长安最大的情报交易所。柳如烟带沈清歌来到三楼的密室，墙上挂满了各色人物的画像和情报。\"二十年前，长安城发生过一桩灭门案。\"柳如烟指着墙上一幅泛黄的画像，\"礼部尚书沈家，满门三十七口，一夜之间尽数被杀。唯一幸存的，是一个刚出生三天的女婴。\"沈清歌的心跳漏了一拍。\"那个女婴，就是你。\"柳如烟转身面对她，\"你的父亲沈正清发现了当朝宰相通敌叛国的证据，所以被灭口。而你被院正大人偷偷带出，养在太医院。\"\"那……杀我的人……\"\"宰相的人。他们发现你还没死，而且你师父开始重新调查当年的案子。\"柳如烟叹了口气，\"清歌，你现在很危险。\"",
             summary="柳如烟揭示沈清歌的真实身世——礼部尚书沈家灭门案的唯一幸存者，宰相通敌叛国的真相浮出水面。",
             notes="身世揭秘章节。"),
    ]
    world = dict(
        title="长安世界观",
        overview="架空古代王朝'大衍'，都城长安。朝堂权谋与江湖恩怨交织，太医院暗藏玄机。",
        rules="1. 医官有独立的司法豁免权，但不适用于'叛国罪'\n2. 烟雨楼是中立情报组织，不参与朝堂争斗\n3. 将军府有先斩后奏之权，但仅限战时",
        factions="太医院：医疗中枢，暗中维护皇室健康。\n将军府：萧家世代镇守北境。\n烟雨楼：中立情报组织。\n宰相府：当朝宰相的势力，暗通北狄。\n大理寺：司法机构，被宰相渗透。",
        locations="太医院：沈清歌工作生活之地。\n将军府：萧景琰府邸。\n烟雨楼：情报交易所。\n东市：长安最繁华的商业区。\n北境：萧景琰驻守之地。",
        timeline="二十年前：沈家灭门案，女婴被院正救出。\n十年前：萧景琰随父出征北境。\n三年前：北境之战，萧景琰负伤。\n故事开始：院正被捕，沈清歌身世揭开。",
        extra_notes="梅花是沈家的家徽，也是贯穿全书的意象。宰相通敌的证据藏在一本医书里——这也是院正被灭口的原因。",
    )
    return p_id, chars, chaps, world


def build_project_3(owner_id: str):
    """《幻想纪元》— ACG·异世界·通用"""
    p_id = uid()
    chars = [
        dict(id=uid(), name="星野遥", alias="破晓之剑", owner_id=owner_id,
             description="被召唤到异世界的高中生，拥有独特的'时间回溯'能力。",
             profile="男，17岁，身高172cm，黑发蓝瞳，穿着被系统改造的校服。异世界冒险者。",
             personality="乐观开朗但内心有自卑感。在现实中是不起眼的普通人，在异世界逐渐找到自信。",
             background="普通高中生，成绩中等，没有特长。在一次放学路上被异世界的召唤阵卷入。",
             relationship_notes="与艾莉丝是搭档关系，互相信任。与凯因亦敌亦友。对希尔达有朦胧好感。",
             tags="主角,男性,穿越者,时间能力"),
        dict(id=uid(), name="艾莉丝·星芒", alias="星之魔女", owner_id=owner_id,
             description="异世界最强的魔法师之一，外表少女实际已活了千年。",
             profile="女，外表16岁实际1000+岁，身高158cm，银色长发，紫色瞳孔。星芒魔法塔主人。",
             personality="表面毒舌傲娇，实际善良温柔。对人类的短命感到悲伤，因此不愿与人深交。",
             background="上古时代的魔法天才，为了等待预言中的'破晓之剑'而用魔法延长了寿命。",
             relationship_notes="与星野遥是搭档，逐渐敞开心扉。与凯因有千年前的恩怨。对希尔达有戒心。",
             tags="主角,女性,魔女,长生者"),
        dict(id=uid(), name="凯因·暗焰", alias="堕落勇者", owner_id=owner_id,
             description="上一代被召唤的勇者，因绝望而堕入黑暗，成为魔王。",
             profile="男，外表25岁实际30+岁，身高188cm，黑发红瞳，穿着黑色铠甲。魔王。",
             personality="冷酷无情但内心深处还保留着一丝人性。对'勇者'这个称号充满厌恶。",
             background="十年前被召唤的日本高中生，历经磨难打败魔王后发现一切都是骗局，愤而成为新魔王。",
             relationship_notes="与星野遥是镜像关系——如果遥也经历同样的绝望，可能会走上同样的路。与艾莉丝有千年前的恩怨。",
             tags="反派,男性,堕落勇者,魔王"),
    ]
    chaps = [
        dict(id=uid(), title="第一章 异世界召唤", order_index=0, status="done", word_count=1050,
             content="<h2>一</h2><p>放学铃声响起的那一刻，星野遥还不知道自己的人生即将彻底改变。</p><p>他像往常一样背着书包走出校门，耳机里放着动漫OST。秋天的风吹过脸颊，带着一丝凉意。</p><p>然后，地面出现了魔法阵。</p><p>蓝色的光芒从脚下升起，符文在空气中旋转。星野遥还没来得及尖叫，整个人就被光芒吞没了。</p><p>当他再次睁开眼睛时，面前是一个巨大的石制大厅，穹顶上镶嵌着会发光的水晶。十几个穿着长袍的人围着他，脸上是掩饰不住的兴奋。</p><p>\"成功了！勇者召唤成功了！\"</p><p>星野遥：\"……哈？\"</p><h2>二</h2><p>接下来的半小时是星野遥人生中最混乱的三十分钟。</p><p>他得知自己被召唤到了一个叫'艾特兰'的异世界，而他被选中成为'破晓之剑'——预言中能够打败魔王的勇者。</p><p>\"等等，\"星野遥举手，\"我就是个普通高中生啊。我体育不及格，游戏打不过Boss，连告白都被拒绝了三次。你们确定没召唤错人？\"</p><p>大祭司微笑：\"命运的选择，从来不会出错。\"</p><p>就在这时，大厅的门被踢开了。</p><p>一个银发少女站在门口，紫色的眼睛扫过在场所有人，最后停在星野遥身上，露出一个不屑的表情：</p><p>\"就这？\"</p>",
             plain_text="放学铃声响起的那一刻，星野遥还不知道自己的人生即将彻底改变。他像往常一样背着书包走出校门，耳机里放着动漫OST。秋天的风吹过脸颊，带着一丝凉意。然后，地面出现了魔法阵。蓝色的光芒从脚下升起，符文在空气中旋转。星野遥还没来得及尖叫，整个人就被光芒吞没了。当他再次睁开眼睛时，面前是一个巨大的石制大厅，穹顶上镶嵌着会发光的水晶。十几个穿着长袍的人围着他，脸上是掩饰不住的兴奋。\"成功了！勇者召唤成功了！\"星野遥：\"……哈？\"接下来的半小时是星野遥人生中最混乱的三十分钟。他得知自己被召唤到了一个叫'艾特兰'的异世界，而他被选中成为'破晓之剑'——预言中能够打败魔王的勇者。\"等等，\"星野遥举手，\"我就是个普通高中生啊。我体育不及格，游戏打不过Boss，连告白都被拒绝了三次。你们确定没召唤错人？\"大祭司微笑：\"命运的选择，从来不会出错。\"就在这时，大厅的门被踢开了。一个银发少女站在门口，紫色的眼睛扫过在场所有人，最后停在星野遥身上，露出一个不屑的表情：\"就这？\"",
             summary="普通高中生星野遥被召唤到异世界艾特兰，成为预言中的'破晓之剑'。银发魔女艾莉丝登场。",
             notes="ACG风格开篇，轻松幽默的穿越召唤。"),
        dict(id=uid(), title="第二章 时间回溯", order_index=1, status="done", word_count=880,
             content="<h2>一</h2><p>星野遥的第一个任务是讨伐出现在村庄附近的哥布林群。</p><p>\"很简单的小怪，\"艾莉丝靠在树上，完全没有帮忙的意思，\"让我看看你有什么本事。\"</p><p>星野遥握着大祭司给他的铁剑，双腿发抖。哥布林虽然矮小，但十几只一起冲过来还是很吓人。</p><p>第一只哥布林扑过来时，他本能地挥剑——砍空了。哥布林的短刀划过他的手臂，鲜血飞溅。</p><p>\"啊——！\"</p><p>然后，世界静止了。</p><p>不，不是静止——是倒流。</p><p>星野遥看到飞溅的鲜血倒流回伤口，看到哥布林倒退着回到原来的位置。他的意识还清醒，但身体回到了三秒前的状态。</p><p>\"时间……回溯了？\"</p><p>这一次，他准确地预判了哥布林的攻击轨迹，一剑斩下。</p><h2>二</h2><p>战斗结束后，艾莉丝的表情变了。</p><p>\"时间回溯……\"她喃喃道，紫色的眼睛里是星野遥看不懂的情绪，\"原来如此，这就是预言中'破晓之剑'的真正含义。\"</p><p>\"什么意思？\"</p><p>\"上一代勇者凯因，他的能力是'绝对破坏'——能够摧毁一切的力量。但他最终被力量吞噬，成为了魔王。\"艾莉丝看向远方，\"而你的能力是'时间回溯'——不是破坏，而是重来。这意味着……\"</p><p>她没有说完，但星野遥隐约明白了。</p><p>如果凯因代表的是'无法挽回的毁灭'，那他代表的就是'永远可以重来的希望'。</p>",
             plain_text="星野遥的第一个任务是讨伐出现在村庄附近的哥布林群。\"很简单的小怪，\"艾莉丝靠在树上，完全没有帮忙的意思，\"让我看看你有什么本事。\"星野遥握着大祭司给他的铁剑，双腿发抖。哥布林虽然矮小，但十几只一起冲过来还是很吓人。第一只哥布林扑过来时，他本能地挥剑——砍空了。哥布林的短刀划过他的手臂，鲜血飞溅。\"啊——！\"然后，世界静止了。不，不是静止——是倒流。星野遥看到飞溅的鲜血倒流回伤口，看到哥布林倒退着回到原来的位置。他的意识还清醒，但身体回到了三秒前的状态。\"时间……回溯了？\"这一次，他准确地预判了哥布林的攻击轨迹，一剑斩下。战斗结束后，艾莉丝的表情变了。\"时间回溯……\"她喃喃道，紫色的眼睛里是星野遥看不懂的情绪，\"原来如此，这就是预言中'破晓之剑'的真正含义。\"\"什么意思？\"\"上一代勇者凯因，他的能力是'绝对破坏'——能够摧毁一切的力量。但他最终被力量吞噬，成为了魔王。\"艾莉丝看向远方，\"而你的能力是'时间回溯'——不是破坏，而是重来。这意味着……\"她没有说完，但星野遥隐约明白了。如果凯因代表的是'无法挽回的毁灭'，那他代表的就是'永远可以重来的希望'。",
             summary="星野遥首次战斗中觉醒'时间回溯'能力。艾莉丝揭示上代勇者凯因的悲剧，暗示两种能力的本质对立。",
             notes="能力觉醒章节，建立'时间回溯'vs'绝对破坏'的核心对立。"),
        dict(id=uid(), title="第三章 堕落勇者", order_index=2, status="draft", word_count=0,
             content=None, plain_text=None,
             summary=None, notes="计划章节：凯因正式登场，星野遥面对'如果自己也经历同样的绝望会怎样'的灵魂拷问。"),
    ]
    world = dict(
        title="艾特兰世界观",
        overview="剑与魔法的异世界'艾特兰'，由勇者召唤系统维系平衡。每当地狱之门出现裂缝，系统就会从异世界召唤勇者来对抗魔王。",
        rules="1. 勇者召唤是不可逆的，被召唤者无法回到原来的世界\n2. 每个勇者都有独特的能力，由灵魂本质决定\n3. 勇者如果内心堕落，能力会变异\n4. 地狱之门的裂缝会定期出现，需要勇者封印\n5. 魔王不是天生的，而是被力量吞噬的前勇者",
        factions="王国军：人类国家的正规军。\n魔法塔：魔法师组织，艾莉丝是创始人。\n魔王军：凯因领导的暗黑势力。\n冒险者公会：中立的佣兵组织。\n神殿：负责勇者召唤和神谕解读。",
        locations="王都：人类王国的首都，召唤仪式在此举行。\n星芒魔法塔：艾莉丝的据点。\n边境村庄：故事开始的战场。\n魔王城：凯因的大本营。\n地狱之门：连接魔界的入口。",
        timeline="千年前：第一个勇者被召唤，打败魔王。\n十年前：凯因被召唤，打败魔王后堕落为新魔王。\n故事开始：星野遥被召唤，时间回溯能力觉醒。",
        extra_notes="时间回溯能力有副作用——每次使用会消耗星野遥的记忆。这是一个重要的伏笔：如果他回溯太多次，可能会忘记自己是谁。",
    )
    return p_id, chars, chaps, world


# ─────────────────────────────────────────────────────────────
# 主流程
# ─────────────────────────────────────────────────────────────

async def seed():
    async with async_session() as db:
        # 1. 查找或创建用户
        result = await db.execute(select(User).where(User.email == EMAIL))
        user = result.scalar_one_or_none()
        if user:
            print(f"[OK] 用户已存在: {user.email} (id={user.id})")
        else:
            user = User(id=uid(), email=EMAIL, hashed_password=hash_password(PASSWORD), is_active=True)
            db.add(user)
            await db.flush()
            print(f"[NEW] 创建用户: {user.email} (id={user.id})")

        owner_id = user.id

        # 2. 构建三个项目的数据（追加到已有数据之上）
        builders = [build_project_1, build_project_2, build_project_3]
        project_names = ["星辰之约", "长安月下", "幻想纪元"]

        for builder, name in zip(builders, project_names):
            p_id, chars_data, chaps_data, world_data = builder(owner_id)

            # 创建项目
            project = Project(
                id=p_id, owner_id=owner_id,
                title=name,
                description=builder.__doc__,
                type={"星辰之约": "original", "长安月下": "fanfiction", "幻想纪元": "acg"}[name],
                source_work={"星辰之约": None, "长安月下": "长安十二时辰", "幻想纪元": "Re:从零开始的异世界生活"}[name],
                status="active",
                channel={"星辰之约": "female", "长安月下": "female", "幻想纪元": "general"}[name],
                genres={"星辰之约": ["现代奇幻","都市异能","浪漫"], "长安月下": ["古风","权谋","言情"], "幻想纪元": ["异世界","冒险","热血"]}[name],
                tropes={"星辰之约": ["命运相遇","身世之谜","守护与牺牲"], "长安月下": ["青梅竹马","身世之谜","宫廷权谋"], "幻想纪元": ["穿越","成长","亦敌亦友"]}[name],
                premise={"星辰之约": "当天文学遇上星辰魔法", "长安月下": "古都长安的医女传奇", "幻想纪元": "普通少年在异世界找到自己的价值"}[name],
                default_model_provider="openai",
                default_model_id="gpt-4o",
            )
            db.add(project)
            await db.flush()
            print(f"  [PROJECT] {name}")

            # 创建角色
            char_ids = []
            for cd in chars_data:
                char = Character(**cd)
                db.add(char)
                await db.flush()
                char_ids.append(char.id)

                # 关联到项目
                pc = ProjectCharacter(
                    id=uid(), project_id=p_id, character_id=char.id,
                    role_label="主角" if "主角" in cd.get("tags", "") else "配角",
                    summary=cd["description"],
                    sort_order=len(char_ids) - 1,
                )
                db.add(pc)

                # 创建角色聊天会话
                chat = CharacterChatSession(
                    id=uid(), owner_id=owner_id, character_id=char.id, project_id=p_id,
                    title=f"与{cd['name']}的对话",
                    messages=[
                        {"role": "user", "content": f"你好，{cd['name']}！能介绍一下自己吗？"},
                        {"role": "assistant", "content": f"你好。{cd.get('personality', '很高兴认识你。')}"},
                    ],
                    model_id="gpt-4o",
                )
                db.add(chat)

            print(f"    [CHARS] {len(chars_data)} 个角色")

            # 创建章节
            chap_ids = []
            for cd in chaps_data:
                ch = Chapter(
                    id=cd["id"], project_id=p_id,
                    title=cd["title"], order_index=cd["order_index"],
                    content=cd.get("content"), plain_text=cd.get("plain_text"),
                    summary=cd.get("summary"), word_count=cd.get("word_count", 0),
                    status=cd["status"], notes=cd.get("notes"),
                )
                db.add(ch)
                await db.flush()
                chap_ids.append(ch.id)

                # 创建章节版本
                if cd.get("content"):
                    ver = ChapterVersion(
                        id=uid(), chapter_id=ch.id,
                        content=cd["content"], plain_text=cd.get("plain_text"),
                        word_count=cd.get("word_count", 0),
                        change_note="初始版本",
                    )
                    db.add(ver)

                # 创建章节记忆
                if cd.get("summary"):
                    mem = ChapterMemory(
                        id=uid(), project_id=p_id, chapter_id=ch.id,
                        summary_short=cd["summary"],
                        summary_long=cd["summary"] + "（详细记忆待AI生成）",
                        key_events=[{"event": cd["summary"], "importance": "high"}],
                        character_state_changes=[],
                        relationship_changes=[],
                        open_loops=[{"label": f"{name}悬念线", "description": "待展开"}],
                        resolved_loops=[],
                        timeline_markers=[{"marker": cd["title"], "significance": "chapter_start"}],
                        important_objects=[],
                        knowledge_state_changes=[],
                    )
                    db.add(mem)

                # 创建文档分块
                if cd.get("plain_text"):
                    text = cd["plain_text"]
                    chunk_size = 500
                    for i in range(0, len(text), chunk_size):
                        chunk_text = text[i:i+chunk_size]
                        dc = DocumentChunk(
                            id=uid(), project_id=p_id, chapter_id=ch.id,
                            chapter_order=cd["order_index"],
                            chunk_index=i // chunk_size,
                            content=chunk_text,
                            content_short=chunk_text[:100] + "..." if len(chunk_text) > 100 else chunk_text,
                            characters=[c["name"] for c in chars_data[:3]],
                            tags=[name],
                            start_offset=i,
                            end_offset=min(i + chunk_size, len(text)),
                        )
                        db.add(dc)

            print(f"    [CHAPTERS] {len(chaps_data)} 章")

            # 创建世界观
            ws = WorldSetting(id=uid(), project_id=p_id, **world_data)
            db.add(ws)
            print(f"    [WORLD] 世界观设定已创建")

            # 创建项目故事记忆
            psm = ProjectStoryMemory(
                id=uid(), project_id=p_id,
                global_plot_summary=f"《{name}》的故事刚刚开始，主角正在经历命运的转折。",
                active_conflicts=[{"conflict": "主要矛盾待展开", "intensity": "building"}],
                resolved_conflicts=[],
                character_arcs=[{"character": chars_data[0]["name"], "arc": "从普通人到英雄的成长之路"}],
                global_open_loops=[{"loop": "核心悬念", "description": "故事的核心谜题待揭示"}],
                timeline_constraints=[],
                world_rules_active=[{"rule": "世界观核心规则", "status": "active"}],
                updated_from_chapter_id=chap_ids[-1] if chap_ids else None,
            )
            db.add(psm)

            # 创建故事实体
            for cd in chars_data:
                entity = StoryEntity(
                    id=uid(), project_id=p_id,
                    entity_type="character",
                    canonical_name=cd["name"],
                    aliases=[cd["alias"]] if cd.get("alias") else [],
                    description=cd["description"],
                    tags=cd.get("tags", "").split(",") if cd.get("tags") else [],
                    first_seen_chapter_id=chap_ids[0] if chap_ids else None,
                    last_seen_chapter_id=chap_ids[-1] if chap_ids else None,
                    first_seen_chapter_order=0,
                    last_seen_chapter_order=len(chaps_data) - 1,
                    mention_count=len(chaps_data),
                )
                db.add(entity)

            # 创建故事事件
            for ch_id, cd in zip(chap_ids, chaps_data):
                if cd.get("summary"):
                    event = StoryEvent(
                        id=uid(), project_id=p_id,
                        chapter_id=ch_id, chapter_order=cd["order_index"],
                        title=cd["title"],
                        summary=cd["summary"],
                        event_type="scene",
                        location="待定",
                        participants=[chars_data[0]["name"]],
                        tags=[name],
                    )
                    db.add(event)

            # 创建故事关系
            if len(chars_data) >= 2:
                for i in range(len(chars_data) - 1):
                    rel = StoryRelation(
                        id=uid(), project_id=p_id,
                        source_entity_name=chars_data[i]["name"],
                        target_entity_name=chars_data[i+1]["name"],
                        relation_type="关联",
                        status_after="发展中",
                        chapter_id=chap_ids[0] if chap_ids else None,
                        chapter_order=0,
                    )
                    db.add(rel)

            # 创建悬念线
            loop = StoryOpenLoop(
                id=uid(), project_id=p_id,
                label=f"{name}核心悬念",
                description=f"《{name}》的主要悬念线，贯穿全书。",
                priority="high", status="open",
                related_entities=[chars_data[0]["name"]],
                first_seen_chapter_id=chap_ids[0] if chap_ids else None,
                last_seen_chapter_id=chap_ids[-1] if chap_ids else None,
                first_seen_chapter_order=0,
                last_seen_chapter_order=len(chaps_data) - 1,
                mention_count=len(chaps_data),
            )
            db.add(loop)

        # 3. 创建AI运行时配置
        ai_setting = AIRuntimeSetting(
            id=uid(), owner_id=owner_id,
            name="GPT-4o 默认配置",
            provider="openai",
            model_id="gpt-4o",
            base_url=None,
            api_key=None,
            is_active=True,
        )
        db.add(ai_setting)

        ai_setting2 = AIRuntimeSetting(
            id=uid(), owner_id=owner_id,
            name="Claude 3.5 Sonnet",
            provider="anthropic",
            model_id="claude-3-5-sonnet-20241022",
            base_url=None,
            api_key=None,
            is_active=False,
        )
        db.add(ai_setting2)
        print(f"  [AI] 2 个AI运行时配置")

        # 4. 提交
        await db.commit()
        print("\n[DONE] 全部测试数据已成功写入数据库！")
        print(f"  用户: {EMAIL}")
        print(f"  项目: 3 个")
        print(f"  角色: 10 个")
        print(f"  章节: 10 章")
        print(f"  世界观: 3 个")
        print(f"  AI配置: 2 个")


if __name__ == "__main__":
    asyncio.run(seed())
