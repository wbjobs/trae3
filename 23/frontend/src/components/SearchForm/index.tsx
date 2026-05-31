import React, { useCallback } from 'react'
import { Form, Button, Space, Row, Col } from 'antd'
import { SearchOutlined, ReloadOutlined } from '@ant-design/icons'
import styles from './index.module.css'

interface SearchFormProps {
  children: React.ReactNode
  onSearch: (values: any) => void
  onReset?: () => void
  showReset?: boolean
  column?: number
}

const SearchForm: React.FC<SearchFormProps> = ({
  children,
  onSearch,
  onReset,
  showReset = true,
  column = 3
}) => {
  const [form] = Form.useForm()

  const handleSearch = useCallback(() => {
    form.validateFields().then((values) => {
      onSearch(values)
    })
  }, [form, onSearch])

  const handleReset = useCallback(() => {
    form.resetFields()
    onReset?.()
  }, [form, onReset])

  return (
    <Form
      form={form}
      className={styles.form}
      onFinish={handleSearch}
    >
      <Row gutter={16} wrap={true}>
        {React.Children.map(children, (child, index) => (
          <Col key={index} span={24 / column}>
            {child}
          </Col>
        ))}
        <Col span={24 / column} className={styles.actions}>
          <Space>
            <Button type="primary" htmlType="submit" icon={<SearchOutlined />}>
              搜索
            </Button>
            {showReset && (
              <Button icon={<ReloadOutlined />} onClick={handleReset}>
                重置
              </Button>
            )}
          </Space>
        </Col>
      </Row>
    </Form>
  )
}

export default SearchForm
